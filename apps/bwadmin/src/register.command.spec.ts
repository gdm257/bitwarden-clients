import * as inquirer from "inquirer";
import { mock, MockProxy } from "jest-mock-extended";
import { of, throwError } from "rxjs";

import { MessageResponse } from "@bitwarden/cli/models/response/message.response";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { InternalAccountService } from "@bitwarden/common/auth/abstractions/account.service";
import {
  PasswordPreloginData,
  PasswordPreloginService,
} from "@bitwarden/common/auth/password-prelogin";
import { UserVerificationService } from "@bitwarden/common/auth/services/user-verification/user-verification.service";
import { InternalMasterPasswordServiceAbstraction } from "@bitwarden/common/key-management/master-password/abstractions/master-password.service.abstraction";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import {
  EnvironmentService,
  Region,
} from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PasswordGenerationServiceAbstraction } from "@bitwarden/generator-legacy";
// eslint-disable-next-line no-restricted-imports
import {
  DEFAULT_KDF_CONFIG,
  KdfConfig,
  LegacyCompatKeyService,
  PBKDF2KdfConfig,
} from "@bitwarden/legacy-crypto";

import { RegisterCommand } from "./register.command";
import { mockI18nT } from "./spec-support";

jest.mock("inquirer", () => {
  const answers: string[] = [];
  let prompts = 0;
  return {
    __setAnswers: (list: string[]) => answers.splice(0, answers.length, ...list),
    __resetPrompts: () => (prompts = 0),
    __promptCount: () => prompts,
    createPromptModule: () => (question: { name: string; message: string }) => {
      prompts++;
      return Promise.resolve({ [question.name]: answers.shift() });
    },
  };
});
const setAnswers = (inquirer as any).__setAnswers as (list: string[]) => void;
const resetPrompts = () => (inquirer as any).__resetPrompts() as void;
const promptCount = () => (inquirer as any).__promptCount() as number;

const FINISH_SIGNUP_URL =
  "https://vw.example.com/#/finish-signup/?email=user%40example.com&token=email-token&fromEmail=true";
const UNENCODED_FINISH_SIGNUP_URL =
  "https://vw.example.com/#/finish-signup/?email=user@example.com&token=email-token";

describe("RegisterCommand", () => {
  let apiService: MockProxy<ApiService>;
  let legacyCompatKeyService: MockProxy<LegacyCompatKeyService>;
  let masterPasswordService: MockProxy<InternalMasterPasswordServiceAbstraction>;
  let passwordPreloginService: MockProxy<PasswordPreloginService>;
  let userVerificationService: MockProxy<UserVerificationService>;
  let logService: MockProxy<LogService>;
  let accountService: MockProxy<InternalAccountService>;
  let environmentService: MockProxy<EnvironmentService>;
  let passwordGenerationService: MockProxy<PasswordGenerationServiceAbstraction>;
  let i18nService: MockProxy<I18nService>;
  let command: RegisterCommand;
  let stderr: string;

  const stubEnvironment = (environment: any) => {
    Object.defineProperty(environmentService, "environment$", {
      value: of({ hasBaseUrl: () => true, ...environment }),
      configurable: true,
    });
  };

  const KDF_CONFIG = new PBKDF2KdfConfig(650000);
  const AUTH_DATA = { authenticationHash: "auth-hash" } as any;
  const UNLOCK_DATA = { wrappedUserKey: "wrapped" } as any;
  const MASTER_KEY = { key: "master" } as any;
  const USER_KEY = { key: "user" } as any;

  beforeEach(() => {
    delete process.env.BW_NOINTERACTION;
    resetPrompts();
    stderr = "";
    jest.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderr += chunk.toString();
      return true;
    });
    apiService = mock<ApiService>();
    legacyCompatKeyService = mock<LegacyCompatKeyService>();
    masterPasswordService = mock<InternalMasterPasswordServiceAbstraction>();
    passwordPreloginService = mock<PasswordPreloginService>();
    userVerificationService = mock<UserVerificationService>();
    logService = mock<LogService>();
    accountService = mock<InternalAccountService>();
    environmentService = mock<EnvironmentService>();
    passwordGenerationService = mock<PasswordGenerationServiceAbstraction>();
    passwordGenerationService.generatePassword.mockResolvedValue("Generated-Password-1!");
    i18nService = mock<I18nService>();
    i18nService.t.mockImplementation(mockI18nT);

    passwordPreloginService.getPreloginData$.mockReturnValue(
      of(new PasswordPreloginData(KDF_CONFIG as KdfConfig, "prelogin-salt")),
    );
    masterPasswordService.emailToSalt.mockReturnValue("user@example.com" as any);
    masterPasswordService.makeMasterPasswordAuthenticationData.mockResolvedValue(AUTH_DATA);
    masterPasswordService.makeMasterPasswordUnlockData.mockResolvedValue(UNLOCK_DATA);
    legacyCompatKeyService.makeMasterKey.mockResolvedValue(MASTER_KEY);
    legacyCompatKeyService.makeUserKey.mockResolvedValue([
      USER_KEY,
      { encryptedString: "2.enc-user-key" },
    ] as any);
    legacyCompatKeyService.makeKeyPair.mockResolvedValue([
      "PUBKEY",
      { encryptedString: "2.enc-priv" },
    ] as any);
    apiService.send.mockResolvedValue(undefined as any);
    Object.defineProperty(environmentService, "environment$", {
      value: of({ getIdentityUrl: () => "https://vw.example.com/identity" } as any),
      configurable: true,
    });

    command = new RegisterCommand(
      apiService,
      legacyCompatKeyService,
      masterPasswordService,
      passwordPreloginService,
      userVerificationService,
      logService,
      accountService,
      environmentService,
      passwordGenerationService,
      i18nService,
    );
  });

  it("registers the account with the prelogin KDF, email, token and derived password fields", async () => {
    setAnswers(["CorrectHorse1", "CorrectHorse1"]);

    const response = await command.run(FINISH_SIGNUP_URL);

    expect(response.success).toBe(true);
    expect((response.data as MessageResponse).title).toContain("user@example.com");
    expect(apiService.send).toHaveBeenCalledWith(
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "email-token",
        masterPasswordAuthentication: AUTH_DATA,
        masterPasswordUnlock: UNLOCK_DATA,
        userAsymmetricKeys: { publicKey: "PUBKEY", encryptedPrivateKey: "2.enc-priv" },
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
    expect(masterPasswordService.makeMasterPasswordAuthenticationData).toHaveBeenCalledWith(
      "CorrectHorse1",
      expect.objectContaining({ iterations: 650000 }),
      "user@example.com",
    );
    expect(masterPasswordService.makeMasterPasswordUnlockData).toHaveBeenCalledWith(
      "CorrectHorse1",
      expect.objectContaining({ iterations: 650000 }),
      "user@example.com",
      USER_KEY,
    );
    expect(legacyCompatKeyService.makeMasterKey).toHaveBeenCalledWith(
      "CorrectHorse1",
      "user@example.com",
      expect.objectContaining({ iterations: 650000 }),
    );
  });

  it("targets the API at the finish-signup link's server", async () => {
    await command.run(FINISH_SIGNUP_URL, { password: "ProvidedPassword1!" });

    expect(environmentService.setEnvironment).toHaveBeenCalledWith("Self-hosted", {
      base: "https://vw.example.com",
    });
  });

  it("registers with --password without prompting", async () => {
    const response = await command.run(FINISH_SIGNUP_URL, { password: "ProvidedPassword1!" });

    expect(response.success).toBe(true);
    expect(promptCount()).toBe(0);
    expect(masterPasswordService.makeMasterPasswordAuthenticationData).toHaveBeenCalledWith(
      "ProvidedPassword1!",
      expect.anything(),
      "user@example.com",
    );
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("generates a password with --generate, prints it once with a change-password hint", async () => {
    const response = await command.run(FINISH_SIGNUP_URL, { generate: true });

    expect(response.success).toBe(true);
    expect(promptCount()).toBe(0);
    const message = response.data as MessageResponse;
    const output = message.title + "\n" + message.message;
    expect(output.match(/Generated-Password-1!/g)?.length).toBe(1);
    expect(output).toContain("change their password after first login");
    expect(masterPasswordService.makeMasterPasswordAuthenticationData).toHaveBeenCalledWith(
      "Generated-Password-1!",
      expect.anything(),
      "user@example.com",
    );
  });

  it("rejects --password together with --generate before any request", async () => {
    const response = await command.run(FINISH_SIGNUP_URL, {
      password: "ProvidedPassword1!",
      generate: true,
    });

    expect(response.success).toBe(false);
    expect(response.message).toContain("mutually exclusive");
    expect(apiService.send).not.toHaveBeenCalled();
    expect(passwordGenerationService.generatePassword).not.toHaveBeenCalled();
    expect(promptCount()).toBe(0);
  });

  it("rejects a link without a token before any request or prompt", async () => {
    const response = await command.run(
      "https://vw.example.com/#/finish-signup/?email=user%40example.com&fromEmail=true",
    );

    expect(response.success).toBe(false);
    expect(response.message).toContain("missing the token parameter");
    expect(apiService.send).not.toHaveBeenCalled();
    expect(masterPasswordService.emailToSalt).not.toHaveBeenCalled();
  });

  it("rejects a link without an email before any request or prompt", async () => {
    const response = await command.run(
      "https://vw.example.com/#/finish-signup/?token=email-token&fromEmail=true",
    );

    expect(response.success).toBe(false);
    expect(response.message).toContain("missing a valid email");
    expect(apiService.send).not.toHaveBeenCalled();
  });

  it("rejects a URL that is not a finish-signup link", async () => {
    const response = await command.run("https://vw.example.com/#/vault");

    expect(response.success).toBe(false);
    expect(response.message).toContain("not a finish-signup link");
    expect(apiService.send).not.toHaveBeenCalled();
  });

  it("finishes the registration from a link whose email is not percent-encoded", async () => {
    const response = await command.run(UNENCODED_FINISH_SIGNUP_URL, {
      password: "ProvidedPassword1!",
    });

    expect(response.success).toBe(true);
    expect(apiService.send).toHaveBeenCalledTimes(1);
    expect(apiService.send).toHaveBeenCalledWith(
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "email-token",
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
  });

  it("falls back to the default KDF config when prelogin returns 404 for an unregistered email", async () => {
    passwordPreloginService.getPreloginData$.mockReturnValue(
      throwError(() => new ErrorResponse("Not found", 404)),
    );

    const response = await command.run(FINISH_SIGNUP_URL, { password: "ProvidedPassword1!" });

    expect(response.success).toBe(true);
    expect(legacyCompatKeyService.makeMasterKey).toHaveBeenCalledWith(
      "ProvidedPassword1!",
      "user@example.com",
      DEFAULT_KDF_CONFIG,
    );
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("errors out without registering when prelogin fails unexpectedly", async () => {
    passwordPreloginService.getPreloginData$.mockReturnValue(
      throwError(() => new Error("Identity unavailable")),
    );

    const response = await command.run(FINISH_SIGNUP_URL, { password: "ProvidedPassword1!" });

    expect(response.success).toBe(false);
    expect(response.message).toContain("Identity unavailable");
    expect(apiService.send).not.toHaveBeenCalled();
    expect(legacyCompatKeyService.makeMasterKey).not.toHaveBeenCalled();
  });

  it("reports an empty master password separately from a mismatch, then registers", async () => {
    setAnswers(["", "CorrectHorse1", "CorrectHorse1"]);

    const response = await command.run(FINISH_SIGNUP_URL);

    expect(response.success).toBe(true);
    expect(stderr).toContain("Master password cannot be empty");
    expect(stderr).not.toContain("do not match");
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("re-prompts when the master passwords do not match, then registers", async () => {
    setAnswers(["CorrectHorse1", "Different1", "CorrectHorse1", "CorrectHorse1"]);

    const response = await command.run(FINISH_SIGNUP_URL);

    expect(response.success).toBe(true);
    expect(stderr).toContain("Master passwords do not match");
    expect(apiService.send).toHaveBeenCalledTimes(1);
    expect(masterPasswordService.makeMasterPasswordAuthenticationData).toHaveBeenCalledWith(
      "CorrectHorse1",
      expect.anything(),
      "user@example.com",
    );
  });

  it("starts registration from an email and finishes directly when the server returns a token", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    apiService.send.mockImplementation((async (_method: string, path: string) => {
      if (path === "/accounts/register/send-verification-email") {
        return "start-token";
      }
      return undefined;
    }) as any);

    const response = await command.run("user@example.com", {
      password: "ProvidedPassword1!",
      name: "Alice",
    });

    expect(response.success).toBe(true);
    expect((response.data as MessageResponse).title).toContain("user@example.com");
    expect(promptCount()).toBe(0);
    expect(apiService.send).toHaveBeenNthCalledWith(
      1,
      "POST",
      "/accounts/register/send-verification-email",
      expect.objectContaining({
        email: "user@example.com",
        name: "Alice",
        receiveMarketingEmails: false,
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
    expect(apiService.send).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "start-token",
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
  });

  it("finishes registration from a pasted finish-signup link when the server requires email verification", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    setAnswers([FINISH_SIGNUP_URL]);

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(true);
    expect((response.data as MessageResponse).title).toContain("user@example.com");
    expect(promptCount()).toBe(1);
    expect(apiService.send).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "email-token",
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
  });

  it("prompts for a pasted link when the start response is an empty token", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      hasBaseUrl: () => true,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    apiService.send.mockImplementation((async (_method: string, path: string) => {
      if (path === "/accounts/register/send-verification-email") {
        return "";
      }
      return undefined;
    }) as any);
    setAnswers([FINISH_SIGNUP_URL]);

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(true);
    expect(promptCount()).toBe(1);
    expect(apiService.send).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "email-token",
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
  });

  it("finishes registration from a pasted bare token", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    setAnswers(["bare-email-token"]);

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(true);
    expect(apiService.send).toHaveBeenNthCalledWith(
      2,
      "POST",
      "/accounts/register/finish",
      expect.objectContaining({
        email: "user@example.com",
        emailVerificationToken: "bare-email-token",
      }),
      false,
      true,
      "https://vw.example.com/identity",
    );
  });

  it("rejects a pasted link for a different email before finishing", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    setAnswers([
      "https://vw.example.com/#/finish-signup/?email=other%40example.com&token=email-token",
    ]);

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(false);
    expect(response.message).toContain("different email address");
    expect(promptCount()).toBe(1);
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty pasted input before finishing", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    setAnswers(["   "]);

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(false);
    expect(response.message).toContain("cannot be empty");
    expect(promptCount()).toBe(1);
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("errors out without prompting when interaction is disabled and email verification is required", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    process.env.BW_NOINTERACTION = "true";
    setAnswers([FINISH_SIGNUP_URL]);

    const response = await command.run("user@example.com");

    expect(response.success).toBe(false);
    expect(response.message).toContain("interactive terminal");
    expect(promptCount()).toBe(0);
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });

  it("refuses to start registration against a cloud environment before any request", async () => {
    stubEnvironment({ getRegion: () => Region.US, isCloud: () => true });

    const response = await command.run("user@example.com");

    expect(response.success).toBe(false);
    expect(response.message).toContain("self-hosted");
    expect(apiService.send).not.toHaveBeenCalled();
    expect(promptCount()).toBe(0);
  });

  it("refuses to start registration when the self-hosted environment has no base url", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      hasBaseUrl: () => false,
    });

    const response = await command.run("user@example.com");

    expect(response.success).toBe(false);
    expect(response.message).toContain("self-hosted");
    expect(apiService.send).not.toHaveBeenCalled();
    expect(promptCount()).toBe(0);
  });

  it("surfaces the server error when starting registration fails", async () => {
    stubEnvironment({
      getRegion: () => Region.SelfHosted,
      isCloud: () => false,
      getIdentityUrl: () => "https://vw.example.com/identity",
    });
    apiService.send.mockRejectedValue(new ErrorResponse("Email already exists", 400));

    const response = await command.run("user@example.com", { password: "ProvidedPassword1!" });

    expect(response.success).toBe(false);
    expect(response.message).toContain("Email already exists");
    expect(apiService.send).toHaveBeenCalledTimes(1);
  });
});
