import * as inquirer from "inquirer";
import { firstValueFrom } from "rxjs";

import { Response } from "@bitwarden/cli/models/response";
import { MessageResponse } from "@bitwarden/cli/models/response/message.response";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AccountApiService } from "@bitwarden/common/auth/abstractions/account-api.service";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import type { InternalAccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { RegisterFinishRequest } from "@bitwarden/common/auth/models/request/registration/register-finish.request";
import { PasswordPreloginService } from "@bitwarden/common/auth/password-prelogin";
import { AccountApiServiceImplementation } from "@bitwarden/common/auth/services/account-api.service";
import { UserVerificationService } from "@bitwarden/common/auth/services/user-verification/user-verification.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/key-management/master-password/abstractions/master-password.service.abstraction";
import { KeysRequest } from "@bitwarden/common/models/request/keys.request";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
// eslint-disable-next-line no-restricted-imports
import { DEFAULT_KDF_CONFIG, KdfConfig, LegacyCompatKeyService } from "@bitwarden/legacy-crypto";

interface FinishSignupLink {
  email: string;
  token: string;
}

export interface RegisterOptions {
  password?: string;
  generate?: boolean;
}

const GENERATED_PASSWORD_OPTIONS = {
  type: "password",
  length: 64,
  uppercase: true,
  lowercase: true,
  number: true,
  special: true,
};

/**
 * Completes account registration from a finish-signup email link. All crypto goes
 * through the shared key-management/legacy-crypto services, mirroring the web
 * registration-finish pipeline; nothing is implemented here.
 */
export class RegisterCommand {
  private accountApiService: AccountApiService;

  constructor(
    apiService: ApiService,
    private legacyCompatKeyService: LegacyCompatKeyService,
    private masterPasswordService: InternalMasterPasswordServiceAbstraction,
    private passwordPreloginService: PasswordPreloginService,
    userVerificationService: UserVerificationService,
    logService: LogService,
    accountService: AccountService,
    environmentService: EnvironmentService,
    private passwordGenerationService: PasswordGenerationServiceAbstraction,
    private i18nService: I18nService,
  ) {
    this.accountApiService = new AccountApiServiceImplementation(
      apiService,
      userVerificationService,
      logService,
      accountService as InternalAccountService,
      environmentService,
    );
  }

  async run(url: string, options: RegisterOptions = {}): Promise<Response> {
    if (options.password != null && options.generate) {
      return Response.badRequest(
        this.i18nService.t("bwadminPasswordAndGenerateAreMutuallyExclusive"),
      );
    }

    const link = this.parseFinishSignupLink(url);
    if (typeof link === "string") {
      return Response.badRequest(link);
    }

    let password: string;
    if (options.password != null) {
      password = options.password;
    } else if (options.generate) {
      password = await this.passwordGenerationService.generatePassword(GENERATED_PASSWORD_OPTIONS);
    } else {
      const prompted = await this.promptMasterPassword();
      if (prompted == null) {
        return Response.badRequest(this.i18nService.t("bwadminRegisterMasterPasswordIsRequired"));
      }
      password = prompted;
    }

    try {
      const kdfConfig = await this.preloginKdfConfig(link.email);
      const salt = this.masterPasswordService.emailToSalt(link.email);
      const masterKey = await this.legacyCompatKeyService.makeMasterKey(password, salt, kdfConfig);
      const [userKey, encUserKey] = await this.legacyCompatKeyService.makeUserKey(masterKey);
      if (userKey == null || encUserKey == null) {
        throw new Error("User key could not be created");
      }
      const [publicKey, encPrivateKey] = await this.legacyCompatKeyService.makeKeyPair(userKey);

      const request = new RegisterFinishRequest(
        link.email,
        null,
        new KeysRequest(publicKey, encPrivateKey.encryptedString),
        await this.masterPasswordService.makeMasterPasswordAuthenticationData(
          password,
          kdfConfig,
          salt,
        ),
        await this.masterPasswordService.makeMasterPasswordUnlockData(
          password,
          kdfConfig,
          salt,
          userKey,
        ),
        link.token,
      );
      await this.accountApiService.registerFinish(request);

      const nextStep = this.i18nService.t("bwadminRegisterNextStep");
      return Response.success(
        new MessageResponse(
          this.i18nService.t("bwadminAccountCreatedFor1", link.email),
          options.generate
            ? [
                this.i18nService.t("bwadminInitialPassword1", password),
                this.i18nService.t("bwadminChangePasswordAfterFirstLogin"),
                "",
                nextStep,
              ].join("\n")
            : nextStep,
        ),
      );
    } catch (e) {
      return Response.error(e);
    }
  }

  // Returns an error message instead of a link when the URL cannot be used.
  private parseFinishSignupLink(url: string): FinishSignupLink | string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return this.i18nService.t("bwadminRegisterLinkIsNotAFinishSignupLink");
    }

    const hash = parsed.hash;
    const queryStart = hash.indexOf("?");
    if (!hash.includes("/finish-signup") || queryStart === -1) {
      return this.i18nService.t("bwadminRegisterLinkIsNotAFinishSignupLink");
    }
    const query = new URLSearchParams(hash.slice(queryStart + 1));

    const email = query.get("email");
    if (email == null || email.indexOf("@") === -1) {
      return this.i18nService.t("bwadminRegisterLinkMissingEmail");
    }
    const token = query.get("token");
    if (token == null || token === "") {
      return this.i18nService.t("bwadminRegisterLinkMissingToken");
    }
    return { email, token };
  }

  private async preloginKdfConfig(email: string): Promise<KdfConfig> {
    try {
      return (await firstValueFrom(this.passwordPreloginService.getPreloginData$(email))).kdfConfig;
    } catch (e) {
      // Unregistered accounts have no prelogin data (404); only that falls back to
      // the client default KDF. Anything else (network failure, server error) must
      // surface instead of registering with an unknown KDF config.
      if (e instanceof ErrorResponse && e.statusCode === 404) {
        return DEFAULT_KDF_CONFIG;
      }
      throw e;
    }
  }

  private async promptMasterPassword(): Promise<string | null> {
    if (process.env.BW_NOINTERACTION === "true") {
      return null;
    }
    const prompt = inquirer.createPromptModule({ output: process.stderr });
    while (true) {
      const first = await this.promptPassword(
        prompt,
        this.i18nService.t("bwadminRegisterMasterPasswordPrompt"),
      );
      if (first === "") {
        process.stderr.write(this.i18nService.t("bwadminRegisterMasterPasswordNotEmpty") + "\n");
        continue;
      }
      const second = await this.promptPassword(
        prompt,
        this.i18nService.t("bwadminRegisterRetypeMasterPasswordPrompt"),
      );
      if (first === second) {
        return first;
      }
      process.stderr.write(this.i18nService.t("bwadminRegisterMasterPasswordsDoNotMatch") + "\n");
    }
  }

  private async promptPassword(
    prompt: ReturnType<typeof inquirer.createPromptModule>,
    message: string,
  ): Promise<string> {
    const answer = await prompt<{ password: string }>({
      type: "password",
      name: "password",
      message,
    });
    return answer.password ?? "";
  }
}
