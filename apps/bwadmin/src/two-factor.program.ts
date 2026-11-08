import { Command, OptionValues } from "commander";
import * as inquirer from "inquirer";
import { firstValueFrom } from "rxjs";

import { PasswordLoginCredentials } from "@bitwarden/auth/common";
import { Response } from "@bitwarden/cli/models/response";
import { ListResponse as CliListResponse } from "@bitwarden/cli/models/response/list.response";
import { TemplateResponse } from "@bitwarden/cli/models/response/template.response";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";
import { CliUtils } from "@bitwarden/cli/utils";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { VerificationType } from "@bitwarden/common/auth/enums/verification-type";
import { TokenTwoFactorRequest } from "@bitwarden/common/auth/models/request/identity-token/token-two-factor.request";
import { SecretVerificationRequest } from "@bitwarden/common/auth/models/request/secret-verification.request";
import { TwoFactorAuthenticatorDeleteRequest } from "@bitwarden/common/auth/two-factor/request/two-factor-authenticator-delete.request";
import { TwoFactorAuthenticatorUpdateRequest } from "@bitwarden/common/auth/two-factor/request/two-factor-authenticator-update.request";
import { TwoFactorEmailDeleteRequest } from "@bitwarden/common/auth/two-factor/request/two-factor-email-delete.request";
import { TwoFactorEmailSetupRequest } from "@bitwarden/common/auth/two-factor/request/two-factor-email-setup.request";
import { TwoFactorEmailUpdateRequest } from "@bitwarden/common/auth/two-factor/request/two-factor-email-update.request";
import { TwoFactorProviderResponse } from "@bitwarden/common/auth/two-factor/response/two-factor-provider.response";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { Utils } from "@bitwarden/common/platform/misc/utils";

const writeLn = CliUtils.writeLn;

const PROVIDER_NAMES: Record<number, string> = {
  [TwoFactorProviderType.Authenticator]: "Authenticator",
  [TwoFactorProviderType.Email]: "Email",
  [TwoFactorProviderType.Duo]: "Duo",
  [TwoFactorProviderType.Yubikey]: "YubiKey",
  [TwoFactorProviderType.OrganizationDuo]: "Organization Duo",
  [TwoFactorProviderType.WebAuthn]: "WebAuthn",
};

function passwordOptions(cmd: Command, serviceContainer: ServiceContainer): Command {
  return cmd
    .option(
      "--passwordenv <passwordenv>",
      serviceContainer.i18nService.t("bwadminEnvironmentVariableStoringYourMasterPassword"),
    )
    .option(
      "--passwordfile <passwordfile>",
      serviceContainer.i18nService.t(
        "bwadminPathToAFileContainingYourMasterPasswordAsItsFirstLine",
      ),
    );
}

async function verificationRequest(
  serviceContainer: ServiceContainer,
  password: string | undefined,
  options: OptionValues,
  processResponse: (response: Response) => void,
): Promise<SecretVerificationRequest | null> {
  const masterPassword = await CliUtils.getPassword(password, options);
  if (masterPassword instanceof Response) {
    processResponse(masterPassword);
    return null;
  }
  return serviceContainer.userVerificationService.buildRequest({
    type: VerificationType.MasterPassword,
    secret: masterPassword as string,
  });
}

/**
 * Registers two-step login management commands (list providers, TOTP/email enroll and
 * disable, recovery-code disable-all) on a Commander program.
 */
export function registerTwoFactorCommands(
  cli: Command,
  serviceContainer: ServiceContainer,
  processResponse: (response: Response) => void = (response) => {
    if (!response.success) {
      writeLn(response.message, true, true);
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  },
): void {
  const twoFactor = cli
    .command("twofactor")
    .description(serviceContainer.i18nService.t("bwadminManageTwoStepLoginProviders"));

  twoFactor
    .command("list")
    .description(
      serviceContainer.i18nService.t("bwadminListTheEnabledTwoStepLoginProvidersForTheCurrentUser"),
    )
    .action(async () => {
      const response = await serviceContainer.twoFactorApiService.getTwoFactorProviders();
      const enabled = (response as ListResponse<TwoFactorProviderResponse>).data.filter(
        (p) => p.enabled,
      );
      if (process.env.BW_RESPONSE === "true" || process.env.BW_RAW === "true") {
        processResponse(
          Response.success(
            new CliListResponse(
              enabled.map((provider) => ({
                type: provider.type,
                enabled: provider.enabled,
              })) as any,
            ),
          ),
        );
        return;
      }
      if (enabled.length === 0) {
        writeLn(serviceContainer.i18nService.t("bwadminNoTwoStepLoginProvidersEnabled"));
        return;
      }
      writeLn(serviceContainer.i18nService.t("bwadminEnabledTwoStepLoginProviders"));
      for (const provider of enabled) {
        writeLn(
          "  " +
            (PROVIDER_NAMES[provider.type] ??
              serviceContainer.i18nService.t("bwadminUnknown1", String(provider.type))),
        );
      }
      process.exitCode = 0;
    });

  passwordOptions(
    twoFactor
      .command("totp-enroll [password]")
      .description(
        serviceContainer.i18nService.t(
          "bwadminStartAuthenticatorTotpEnrollmentAndDisplayTheSecretAndOtpauthUri",
        ),
      ),
    serviceContainer,
  ).action(async (password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorAuthenticator(request);
    const email = await activeAccountEmail(serviceContainer);
    const uri =
      "otpauth://totp/Bitwarden:" +
      Utils.encodeRFC3986URIComponent(email) +
      "?secret=" +
      encodeURIComponent(response.authenticator.key) +
      "&issuer=Bitwarden";
    if (process.env.BW_RESPONSE === "true" || process.env.BW_RAW === "true") {
      processResponse(
        Response.success({
          object: "twoFactorAuthenticator",
          key: response.authenticator.key,
          uri,
        } as any),
      );
      return;
    }
    writeLn(
      serviceContainer.i18nService.t("bwadminAuthenticatorSecret") + response.authenticator.key,
    );
    writeLn(serviceContainer.i18nService.t("bwadminOtpauthUri") + uri);
    writeLn(
      serviceContainer.i18nService.t("bwadminEnterTheGeneratedCodeWithTwofactorTotpEnableCode"),
    );
  });

  passwordOptions(
    twoFactor
      .command("totp-enable <code> [password]")
      .description(
        serviceContainer.i18nService.t(
          "bwadminConfirmAuthenticatorTotpEnrollmentWithAVerificationCode",
        ),
      ),
    serviceContainer,
  ).action(async (code: string, password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorAuthenticator(request);
    await serviceContainer.twoFactorApiService.putTwoFactorAuthenticator(
      new TwoFactorAuthenticatorUpdateRequest(
        code,
        response.authenticator.key,
        response.userVerificationToken,
      ),
    );
    processResponse(
      Response.success(
        new TemplateResponse({
          message: serviceContainer.i18nService.t("bwadminAuthenticatorTwoStepLoginEnabled"),
        }),
      ),
    );
  });

  passwordOptions(
    twoFactor
      .command("totp-disable [password]")
      .description(
        serviceContainer.i18nService.t("bwadminDisableTheAuthenticatorTotpTwoStepLoginProvider"),
      ),
    serviceContainer,
  ).action(async (password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorAuthenticator(request);
    await serviceContainer.twoFactorApiService.deleteTwoFactorAuthenticator(
      new TwoFactorAuthenticatorDeleteRequest(
        response.authenticator.key,
        response.userVerificationToken,
      ),
    );
    processResponse(
      Response.success(
        new TemplateResponse({
          message: serviceContainer.i18nService.t("bwadminAuthenticatorTwoStepLoginDisabled"),
        }),
      ),
    );
  });

  passwordOptions(
    twoFactor
      .command("email-enroll [password]")
      .description(
        serviceContainer.i18nService.t(
          "bwadminSendTheEmailTwoStepLoginVerificationCodeToTheAccountEmailAddress",
        ),
      ),
    serviceContainer,
  ).action(async (password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorEmail(request);
    await serviceContainer.twoFactorApiService.postTwoFactorEmailSetup(
      new TwoFactorEmailSetupRequest(response.email.email, response.userVerificationToken),
    );
    if (process.env.BW_RESPONSE === "true" || process.env.BW_RAW === "true") {
      processResponse(
        Response.success(new TemplateResponse({ email: response.email.email, sent: true })),
      );
      return;
    }
    writeLn(
      serviceContainer.i18nService.t("bwadminVerificationCodeSentTo") + response.email.email + ".",
    );
    writeLn(serviceContainer.i18nService.t("bwadminEnterTheCodeWithTwofactorEmailEnableCode"));
  });

  passwordOptions(
    twoFactor
      .command("email-enable <code> [password]")
      .description(
        serviceContainer.i18nService.t(
          "bwadminConfirmEmailTwoStepLoginEnrollmentWithTheEmailedVerificationCode",
        ),
      ),
    serviceContainer,
  ).action(async (code: string, password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorEmail(request);
    await serviceContainer.twoFactorApiService.putTwoFactorEmail(
      new TwoFactorEmailUpdateRequest(code, response.email.email, response.userVerificationToken),
    );
    processResponse(
      Response.success(
        new TemplateResponse({
          message: serviceContainer.i18nService.t("bwadminEmailTwoStepLoginEnabled"),
        }),
      ),
    );
  });

  passwordOptions(
    twoFactor
      .command("email-disable [password]")
      .description(serviceContainer.i18nService.t("bwadminDisableTheEmailTwoStepLoginProvider")),
    serviceContainer,
  ).action(async (password: string, options: OptionValues) => {
    const request = await verificationRequest(serviceContainer, password, options, processResponse);
    if (request == null) {
      return;
    }
    const response = await serviceContainer.twoFactorApiService.getTwoFactorEmail(request);
    await serviceContainer.twoFactorApiService.deleteTwoFactorEmail(
      new TwoFactorEmailDeleteRequest(response.userVerificationToken),
    );
    processResponse(
      Response.success(
        new TemplateResponse({
          message: serviceContainer.i18nService.t("bwadminEmailTwoStepLoginDisabled"),
        }),
      ),
    );
  });

  twoFactor
    .command("recover <email> <password> <code>")
    .description(
      serviceContainer.i18nService.t(
        "bwadminUseASingleUseRecoveryCodeToDisableAllTwoStepLoginProvidersForTheAccount",
      ),
    )
    .action(async (email: string, password: string, code: string) => {
      const confirmed = await confirmTwice(
        serviceContainer.i18nService.t("bwadminDisableAllTwoStepLoginProvidersFor") +
          email.trim().toLowerCase() +
          "?",
        serviceContainer,
      );
      if (!confirmed) {
        processResponse(
          Response.success(
            new TemplateResponse({ message: serviceContainer.i18nService.t("bwadminCancelled") }),
          ),
        );
        return;
      }

      const twoFactorRequest: TokenTwoFactorRequest = {
        provider: TwoFactorProviderType.RecoveryCode,
        token: code.replace(/\s/g, "").toLowerCase(),
        remember: false,
      };
      await serviceContainer.loginStrategyService.logIn(
        new PasswordLoginCredentials(email.trim().toLowerCase(), password, twoFactorRequest),
      );
      // Keep the recovered session; the vault session stays usable for re-enrollment.
      processResponse(
        Response.success(
          new TemplateResponse({
            message: serviceContainer.i18nService.t(
              "bwadminAllTwoStepLoginProvidersHaveBeenDisabledLogInAgainToReEnroll2fa",
            ),
          }),
        ),
      );
    });
}

async function confirmTwice(message: string, serviceContainer: ServiceContainer): Promise<boolean> {
  const prompt = inquirer.createPromptModule({ output: process.stderr });
  const first = await prompt({ type: "confirm", name: "confirm", message });
  if (!first.confirm) {
    return false;
  }
  const second = await prompt({
    type: "confirm",
    name: "confirm",
    message: serviceContainer.i18nService.t("bwadminThisCannotBeUndoneAreYouSure"),
  });
  return second.confirm === true;
}

async function activeAccountEmail(serviceContainer: ServiceContainer): Promise<string> {
  const account = await firstValueFrom(serviceContainer.accountService.activeAccount$);
  return account?.email ?? "";
}
