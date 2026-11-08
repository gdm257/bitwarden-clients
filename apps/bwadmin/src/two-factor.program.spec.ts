import { Command } from "commander";
import { mock, mockDeep, MockProxy } from "jest-mock-extended";
import { of } from "rxjs";

import { PasswordLoginCredentials } from "@bitwarden/auth/common";
import { Response } from "@bitwarden/cli/models/response";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";

import { mockI18nT } from "./spec-support";
import { registerTwoFactorCommands } from "./two-factor.program";

// Avoid loading the real ServiceContainer dependency graph in tests.
jest.mock("@bitwarden/cli/service-container/service-container", () => ({
  ServiceContainer: class {},
}));

// Inquirer double confirmation answers, consumed in order.
const mockConfirmAnswers: boolean[] = [];
jest.mock("inquirer", () => ({
  createPromptModule: () => async () => ({ confirm: mockConfirmAnswers.shift() ?? false }),
}));

const TEST_USER_ID = "test-user-id" as import("@bitwarden/common/types/guid").UserId;

describe("two-factor commands", () => {
  let serviceContainer: ServiceContainer & {
    [K in keyof ServiceContainer]: MockProxy<ServiceContainer[K]>;
  };
  let cli: Command;
  let stdout: string;

  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ["BW_NOINTERACTION", "BW_RESPONSE", "BW_RAW"];

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.BW_NOINTERACTION = "true";
    delete process.env.BW_RESPONSE;
    delete process.env.BW_RAW;

    serviceContainer = mockDeep<ServiceContainer>();
    serviceContainer.i18nService.t.mockImplementation(mockI18nT);
    serviceContainer.userVerificationService.buildRequest.mockResolvedValue({
      masterPasswordHash: "hashed-password",
    } as Awaited<ReturnType<typeof serviceContainer.userVerificationService.buildRequest>>);
    Object.defineProperty(serviceContainer.accountService, "activeAccount$", {
      value: of({ email: "user@example.com" }),
      configurable: true,
    });
    mockConfirmAnswers.length = 0;
    serviceContainer.loginStrategyService.logIn.mockResolvedValue({
      userId: TEST_USER_ID,
    } as Awaited<ReturnType<typeof serviceContainer.loginStrategyService.logIn>>);
    serviceContainer.logout = jest.fn().mockResolvedValue(undefined);

    stdout = "";
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout += chunk.toString();
      return true;
    });

    cli = new Command();
    registerTwoFactorCommands(cli, serviceContainer, (r: Response) => {
      // Minimal stand-in for AdminProgram.processResponse for success output.
      if (r.success) {
        const data = r.data as any;
        process.stdout.write(JSON.stringify(data.object === "list" ? data.data : data));
      } else {
        process.exitCode = 1;
      }
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    jest.restoreAllMocks();
  });

  describe("twofactor list", () => {
    it("lists enabled providers by name", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorProviders.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorProviders>>
        >({
          data: [
            { enabled: true, type: 0 },
            { enabled: true, type: 1 },
            { enabled: false, type: 7 },
          ],
        }),
      );

      await cli.parseAsync(["node", "bwadmin", "twofactor", "list"]);

      expect(serviceContainer.twoFactorApiService.getTwoFactorProviders).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("Authenticator");
      expect(stdout).toContain("Email");
      expect(stdout).not.toContain("WebAuthn");
    });

    it("reports when no providers are enabled", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorProviders.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorProviders>>
        >({ data: [] }),
      );

      await cli.parseAsync(["node", "bwadmin", "twofactor", "list"]);

      expect(stdout).toContain("No two-step login providers enabled");
    });

    it("outputs provider JSON with --raw", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorProviders.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorProviders>>
        >({
          data: [
            { enabled: true, type: 0 },
            { enabled: true, type: 1 },
            { enabled: false, type: 7 },
          ],
        }),
      );
      process.env.BW_RAW = "true";

      await cli.parseAsync(["node", "bwadmin", "twofactor", "list"]);

      expect(JSON.parse(stdout)).toEqual([
        { type: 0, enabled: true },
        { type: 1, enabled: true },
      ]);
    });

    it("outputs provider JSON with --response", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorProviders.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorProviders>>
        >({
          data: [
            { enabled: true, type: 0 },
            { enabled: true, type: 2 },
          ],
        }),
      );
      process.env.BW_RESPONSE = "true";

      await cli.parseAsync(["node", "bwadmin", "twofactor", "list"]);

      expect(JSON.parse(stdout)).toEqual([
        expect.objectContaining({ type: 0, enabled: true }),
        expect.objectContaining({ type: 2, enabled: true }),
      ]);
    });
  });

  describe("twofactor totp-enroll", () => {
    it("verifies the master password and shows the secret and otpauth URI", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorAuthenticator.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorAuthenticator>>
        >({
          authenticator: { enabled: false, key: "TESTSECRET" },
          userVerificationToken: "token",
        }),
      );

      await cli.parseAsync(["node", "bwadmin", "twofactor", "totp-enroll", "password123"]);

      expect(serviceContainer.userVerificationService.buildRequest).toHaveBeenCalledWith(
        expect.objectContaining({ secret: "password123" }),
      );
      expect(serviceContainer.twoFactorApiService.getTwoFactorAuthenticator).toHaveBeenCalledWith({
        masterPasswordHash: "hashed-password",
      });
      expect(stdout).toContain("TESTSECRET");
      expect(stdout).toContain("otpauth://totp/Bitwarden:");
      expect(stdout).toContain("secret=TESTSECRET");
    });

    it("outputs the secret and otpauth URI as JSON with BW_RESPONSE", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorAuthenticator.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorAuthenticator>>
        >({
          authenticator: { enabled: false, key: "TESTSECRET" },
          userVerificationToken: "token",
        }),
      );
      process.env.BW_RESPONSE = "true";

      await cli.parseAsync(["node", "bwadmin", "twofactor", "totp-enroll", "password123"]);

      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual(
        expect.objectContaining({
          key: "TESTSECRET",
          uri: expect.stringContaining("secret=TESTSECRET"),
        }),
      );
    });
  });

  describe("twofactor totp-enable", () => {
    it("enables TOTP with the verification code", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorAuthenticator.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorAuthenticator>>
        >({
          authenticator: { enabled: false, key: "TESTSECRET" },
          userVerificationToken: "verification-token",
        }),
      );
      serviceContainer.twoFactorApiService.putTwoFactorAuthenticator.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.putTwoFactorAuthenticator>>
        >({}),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "twofactor",
        "totp-enable",
        "123456",
        "password123",
      ]);

      expect(serviceContainer.twoFactorApiService.putTwoFactorAuthenticator).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "123456",
          key: "TESTSECRET",
          userVerificationToken: "verification-token",
        }),
      );
      expect(stdout.toLowerCase()).toContain("enabled");
    });
  });

  describe("twofactor totp-disable", () => {
    it("disables TOTP with the user verification token", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorAuthenticator.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorAuthenticator>>
        >({
          authenticator: { enabled: true, key: "TESTSECRET" },
          userVerificationToken: "verification-token",
        }),
      );

      await cli.parseAsync(["node", "bwadmin", "twofactor", "totp-disable", "password123"]);

      expect(
        serviceContainer.twoFactorApiService.deleteTwoFactorAuthenticator,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "TESTSECRET",
          userVerificationToken: "verification-token",
        }),
      );
      expect(stdout.toLowerCase()).toContain("disabled");
    });
  });

  describe("twofactor email-enroll", () => {
    it("sends the verification code to the account email", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorEmail.mockResolvedValue({
        email: { enabled: false, email: "user@example.com" },
        userVerificationToken: "verification-token",
      } as Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorEmail>>);

      await cli.parseAsync(["node", "bwadmin", "twofactor", "email-enroll", "password123"]);

      expect(serviceContainer.twoFactorApiService.postTwoFactorEmailSetup).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@example.com",
          userVerificationToken: "verification-token",
        }),
      );
      expect(stdout).toContain("user@example.com");
    });
  });

  describe("twofactor email-enable", () => {
    it("enables email two-step login with the emailed code", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorEmail.mockResolvedValue({
        email: { enabled: false, email: "user@example.com" },
        userVerificationToken: "verification-token",
      } as Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorEmail>>);

      await cli.parseAsync([
        "node",
        "bwadmin",
        "twofactor",
        "email-enable",
        "123456",
        "password123",
      ]);

      expect(serviceContainer.twoFactorApiService.putTwoFactorEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          token: "123456",
          email: "user@example.com",
          userVerificationToken: "verification-token",
        }),
      );
      expect(stdout.toLowerCase()).toContain("enabled");
    });
  });

  describe("twofactor email-disable", () => {
    it("disables email two-step login", async () => {
      serviceContainer.twoFactorApiService.getTwoFactorEmail.mockResolvedValue({
        email: { enabled: true, email: "user@example.com" },
        userVerificationToken: "verification-token",
      } as Awaited<ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorEmail>>);

      await cli.parseAsync(["node", "bwadmin", "twofactor", "email-disable", "password123"]);

      expect(serviceContainer.twoFactorApiService.deleteTwoFactorEmail).toHaveBeenCalledWith(
        expect.objectContaining({ userVerificationToken: "verification-token" }),
      );
      expect(stdout.toLowerCase()).toContain("disabled");
    });
  });

  describe("twofactor recover", () => {
    it("requires two confirmations before disabling all providers", async () => {
      mockConfirmAnswers.push(true, true);

      await cli.parseAsync([
        "node",
        "bwadmin",
        "twofactor",
        "recover",
        "user@example.com",
        "password123",
        " ABC DEF ",
      ]);

      expect(serviceContainer.loginStrategyService.logIn).toHaveBeenCalledTimes(1);
      const creds = serviceContainer.loginStrategyService.logIn.mock
        .calls[0][0] as PasswordLoginCredentials;
      expect(creds).toBeInstanceOf(PasswordLoginCredentials);
      const twoFactor = (creds as any).twoFactor;
      expect(twoFactor.provider).toBe(TwoFactorProviderType.RecoveryCode);
      expect(twoFactor.token).toBe("abcdef");
      expect(serviceContainer.logout).not.toHaveBeenCalled();
      expect(stdout).toContain("disabled");
    });

    it("aborts without logging in when the second confirmation is declined", async () => {
      mockConfirmAnswers.push(true, false);

      await cli.parseAsync([
        "node",
        "bwadmin",
        "twofactor",
        "recover",
        "user@example.com",
        "password123",
        "abcdef",
      ]);

      expect(serviceContainer.loginStrategyService.logIn).not.toHaveBeenCalled();
      expect(stdout).toContain("Cancelled");
    });
  });
});
