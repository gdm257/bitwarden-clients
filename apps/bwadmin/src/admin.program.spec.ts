import { Command } from "commander";
import { mock, mockDeep, MockProxy } from "jest-mock-extended";
import { of } from "rxjs";

import { CollectionAdminService } from "@bitwarden/admin-console/common";
import { PasswordLoginCredentials } from "@bitwarden/auth/common";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";
import { OrganizationUserType } from "@bitwarden/common/admin-console/enums";
import { AuthenticationStatus } from "@bitwarden/common/auth/enums/authentication-status";
import { VerificationType } from "@bitwarden/common/auth/enums/verification-type";
import { AuthResult } from "@bitwarden/common/auth/models/domain/auth-result";
import { ForceSetPasswordReason } from "@bitwarden/common/auth/models/domain/force-set-password-reason";
import { DomainsResponse } from "@bitwarden/common/models/response/domains.response";
import { ErrorResponse } from "@bitwarden/common/models/response/error.response";
import { SdkLoadService } from "@bitwarden/common/platform/abstractions/sdk/sdk-load.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { UserId } from "@bitwarden/common/types/guid";
// eslint-disable-next-line no-restricted-imports
import { CsprngArray, PBKDF2KdfConfig, SymmetricCryptoKey } from "@bitwarden/legacy-crypto";
import { PureCrypto } from "@bitwarden/sdk-internal";

import { AdminProgram } from "./admin.program";
import { mockI18nT } from "./spec-support";

// Avoid loading the real ServiceContainer dependency graph in tests.
jest.mock("@bitwarden/cli/service-container/service-container", () => ({
  ServiceContainer: class {},
}));

const TEST_USER_ID = "test-user-id" as UserId;
const MOCK_SESSION_KEY = new Uint8Array(64) as CsprngArray;
const B64_SESSION_KEY = Utils.fromBufferToB64(MOCK_SESSION_KEY);

function mockSuccessAuthResult(): AuthResult {
  const result = new AuthResult();
  result.userId = TEST_USER_ID;
  result.requiresEncryptionKeyMigration = false;
  result.requiresDeviceVerification = false;
  return result;
}

describe("AdminProgram", () => {
  let serviceContainer: ServiceContainer & {
    [K in keyof ServiceContainer]: MockProxy<ServiceContainer[K]>;
  };
  let collectionAdminService: MockProxy<CollectionAdminService>;
  let cli: Command;
  let stdout: string;
  let stderr: string;

  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    "BW_NOINTERACTION",
    "BW_SESSION",
    "BW_CLEANEXIT",
    "BW_QUIET",
    "BW_RESPONSE",
    "BW_RAW",
    "BW_PRETTY",
  ];

  beforeEach(async () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
    }
    process.env.BW_NOINTERACTION = "true";
    for (const key of ENV_KEYS) {
      if (key !== "BW_NOINTERACTION") {
        delete process.env[key];
      }
    }

    serviceContainer = mockDeep<ServiceContainer>();

    // SDK session key generation, mirrored from apps/cli login.command.spec.ts
    Object.defineProperty(SdkLoadService, "Ready", {
      value: Promise.resolve(),
      configurable: true,
    });
    jest.spyOn(PureCrypto, "make_aes256_cbc_hmac_key").mockReturnValue({} as any);
    jest
      .spyOn(SymmetricCryptoKey, "fromSdk")
      .mockReturnValue({ toBase64: () => B64_SESSION_KEY } as SymmetricCryptoKey);

    serviceContainer.i18nService.t.mockImplementation(mockI18nT);
    Object.defineProperty(serviceContainer.accountService, "activeAccount$", {
      value: of({ id: TEST_USER_ID } as any),
      configurable: true,
    });
    Object.defineProperty(serviceContainer.authService, "activeAccountStatus$", {
      value: of(AuthenticationStatus.LoggedOut),
      configurable: true,
    });
    serviceContainer.authService.authStatusFor$.mockReturnValue(of(AuthenticationStatus.Unlocked));
    serviceContainer.tokenService.hasAccessToken$.mockReturnValue(of(true));
    serviceContainer.loginStrategyService.logIn.mockResolvedValue(mockSuccessAuthResult());
    serviceContainer.keyConnectorService.requiresDomainConfirmation$.mockReturnValue(of(null));
    Object.defineProperty(serviceContainer.keyConnectorService, "convertAccountRequired$", {
      value: of(false),
      configurable: true,
    });
    serviceContainer.keyConnectorService.getUsesKeyConnector.mockResolvedValue(false);
    serviceContainer.masterPasswordService.forceSetPasswordReason$.mockReturnValue(
      of(ForceSetPasswordReason.None),
    );
    serviceContainer.syncService.fullSync.mockResolvedValue(true);
    serviceContainer.encryptedMigrator.runMigrations.mockResolvedValue(undefined);
    serviceContainer.environmentService.environment$ = of({
      hasBaseUrl: () => true,
      getUrls: () => ({ base: "https://vw.example.com" }),
      getWebVaultUrl: () => "https://vw.example.com",
    } as any);
    serviceContainer.unlockService.unlockWithMasterPassword.mockResolvedValue(undefined);
    serviceContainer.biometricsService.getBiometricsStatusForUser.mockResolvedValue(0);
    serviceContainer.logout = jest.fn().mockResolvedValue(undefined);

    stdout = "";
    stderr = "";
    jest.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
      stdout += chunk.toString();
      return true;
    });
    jest.spyOn(process.stderr, "write").mockImplementation((chunk: any) => {
      stderr += chunk.toString();
      return true;
    });
    jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code}`);
    }) as never);

    collectionAdminService = mock<CollectionAdminService>();

    cli = new Command();
    await new AdminProgram(serviceContainer, cli, () => collectionAdminService).register();
  });

  describe("group Commander bindings", () => {
    it("creates groups with positional object and parsed options", async () => {
      serviceContainer.apiService.send.mockResolvedValue({ id: "group-1" } as Awaited<
        ReturnType<typeof serviceContainer.apiService.send>
      >);
      await cli.parseAsync([
        "node",
        "bwadmin",
        "create",
        "group",
        "--orgid",
        "org-1",
        "--name",
        "Engineering",
      ]);
      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "POST",
        "/organizations/org-1/groups",
        { name: "Engineering", externalId: undefined, collections: [], users: [] },
        true,
        true,
      );
    });

    it("lists the server group envelope as JSON", async () => {
      serviceContainer.apiService.send.mockResolvedValue({
        data: [{ id: "group-1", name: "Engineering" }],
      } as Awaited<ReturnType<typeof serviceContainer.apiService.send>>);
      await cli.parseAsync(["node", "bwadmin", "list", "groups", "--orgid", "org-1", "--json"]);
      expect(JSON.parse(stdout)).toEqual([
        { object: "group", id: "group-1", name: "Engineering", externalId: null },
      ]);
    });

    it("sets members without formatting a nonexistent list", async () => {
      serviceContainer.apiService.send.mockResolvedValue({
        name: "Engineering",
        collections: [],
      } as Awaited<ReturnType<typeof serviceContainer.apiService.send>>);
      await cli.parseAsync([
        "node",
        "bwadmin",
        "group",
        "members",
        "--orgid",
        "org-1",
        "--groupid",
        "group-1",
        "--userid",
        "member-1",
      ]);
      expect(serviceContainer.apiService.send).toHaveBeenLastCalledWith(
        "PUT",
        "/organizations/org-1/groups/group-1",
        { name: "Engineering", collections: [], users: ["member-1"] },
        true,
        true,
      );
      expect(process.exitCode).toBe(0);
    });

    it("renames groups with parsed options and preserves access", async () => {
      serviceContainer.apiService.send.mockResolvedValue({ name: "Old", collections: [] });
      serviceContainer.apiService.getGroupUsers.mockResolvedValue(["member-1"]);
      await cli.parseAsync([
        "node",
        "bwadmin",
        "edit",
        "group",
        "--orgid",
        "org-1",
        "--groupid",
        "group-1",
        "--name",
        "New",
      ]);
      expect(serviceContainer.apiService.send).toHaveBeenLastCalledWith(
        "PUT",
        "/organizations/org-1/groups/group-1",
        { name: "New", collections: [], users: ["member-1"] },
        true,
        true,
      );
    });

    it.each([["group-1"], ["group-1", "group-2"]])(
      "deletes groups with parsed options %s",
      async (...ids: string[]) => {
        await cli.parseAsync([
          "node",
          "bwadmin",
          "delete",
          "group",
          "--orgid",
          "org-1",
          "--groupid",
          ...ids,
        ]);
        expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
          "DELETE",
          ids.length === 1 ? "/organizations/org-1/groups/group-1" : "/organizations/org-1/groups",
          ids.length === 1 ? null : { ids },
          true,
          ids.length !== 1,
        );
      },
    );

    it.each(["--raw", "--json", "--response"])(
      "writes structured twofactor output for %s",
      async (flag) => {
        serviceContainer.twoFactorApiService.getTwoFactorProviders.mockResolvedValue({
          data: [{ type: 0, enabled: true }],
        } as Awaited<
          ReturnType<typeof serviceContainer.twoFactorApiService.getTwoFactorProviders>
        >);
        await cli.parseAsync(["node", "bwadmin", "twofactor", "list", flag]);
        const parsed = JSON.parse(stdout);
        expect(flag === "--response" ? parsed.data.data : parsed).toEqual([
          { type: 0, enabled: true },
        ]);
      },
    );

    it("rejects unknown numeric policy types before API access", async () => {
      await cli.parseAsync(["node", "bwadmin", "policy", "999999", "--orgid", "org-1"]);
      expect(serviceContainer.policyApiService.getPolicy).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
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

  it("registers the base commands", () => {
    const names = cli.commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining([
        "login",
        "unlock",
        "lock",
        "sync",
        "logout",
        "config",
        "update-password",
        "kdf",
        "domains",
        "otp",
      ]),
    );
  });

  /** Fake SDK user client whose user_crypto_management calls are jest mocks. */
  function fakeSdkClient(userCryptoManagement: Record<string, jest.Mock>) {
    return {
      take: () => ({
        value: { user_crypto_management: () => userCryptoManagement },
        [Symbol.dispose]: () => {},
      }),
    };
  }

  describe("update-password", () => {
    it("delegates the password change and vault re-encryption to the existing SDK key-rotation path", async () => {
      const passwordChange = jest.fn().mockResolvedValue(undefined);
      serviceContainer.sdkService.userClient$.mockReturnValue(
        of(
          fakeSdkClient({
            password_change_and_rotate_user_keys: passwordChange,
            get_untrusted_memberships: jest.fn().mockResolvedValue({
              emergency_access_memberships: [],
              organization_memberships: [],
            }),
          }) as any,
        ),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "update-password",
        "oldPassword123",
        "newPassword456",
        "--hint",
        "my hint",
      ]);

      expect(passwordChange).toHaveBeenCalledWith(
        expect.objectContaining({
          old_password: "oldPassword123",
          password: "newPassword456",
          hint: "my hint",
        }),
      );
      expect(stdout).toContain("Master password changed");
    });

    it("reports a failure when the key rotation is rejected", async () => {
      serviceContainer.sdkService.userClient$.mockReturnValue(
        of(
          fakeSdkClient({
            password_change_and_rotate_user_keys: jest.fn().mockRejectedValue(new Error("nope")),
            get_untrusted_memberships: jest.fn().mockResolvedValue({
              emergency_access_memberships: [],
              organization_memberships: [],
            }),
          }) as any,
        ),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "update-password",
        "oldPassword123",
        "newPassword456",
      ]);

      expect(stderr).toContain("Master password change failed");
    });
  });

  describe("kdf", () => {
    it("shows the current KDF settings", async () => {
      serviceContainer.kdfConfigService.getKdfConfig.mockResolvedValue(
        new PBKDF2KdfConfig(600_000),
      );

      await cli.parseAsync(["node", "bwadmin", "kdf"]);

      expect(serviceContainer.kdfConfigService.getKdfConfig).toHaveBeenCalledWith(TEST_USER_ID);
      expect(stdout).toContain("PBKDF2");
      expect(stdout).toContain("600000");
    });

    it("updates KDF settings to Argon2id through the existing SDK path", async () => {
      serviceContainer.kdfConfigService.getKdfConfig.mockResolvedValue(
        new PBKDF2KdfConfig(600_000),
      );
      const changeKdf = jest.fn().mockResolvedValue(undefined);
      serviceContainer.sdkService.userClient$.mockReturnValue(
        of(fakeSdkClient({ change_kdf: changeKdf }) as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "kdf",
        "masterPassword123",
        "--type",
        "1",
        "--iterations",
        "4",
        "--memory",
        "64",
        "--parallelism",
        "4",
      ]);

      expect(changeKdf).toHaveBeenCalledWith("masterPassword123", {
        argon2id: { iterations: 4, memory: 64, parallelism: 4 },
      });
      expect(stdout).toContain("KDF settings updated");
    });

    it("rejects invalid Argon2id parameters without calling the SDK", async () => {
      serviceContainer.kdfConfigService.getKdfConfig.mockResolvedValue(
        new PBKDF2KdfConfig(600_000),
      );
      const changeKdf = jest.fn();
      serviceContainer.sdkService.userClient$.mockReturnValue(
        of(fakeSdkClient({ change_kdf: changeKdf }) as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "kdf",
        "masterPassword123",
        "--type",
        "1",
        "--iterations",
        "4",
        "--memory",
        "1",
        "--parallelism",
        "4",
      ]);

      expect(changeKdf).not.toHaveBeenCalled();
      expect(stderr).toContain("memory");
    });
  });

  describe("domains", () => {
    it("shows the current equivalent-domain rules from the server", async () => {
      serviceContainer.apiService.getSettingsDomains.mockResolvedValue(
        new DomainsResponse({
          EquivalentDomains: [["example.com", "example.org"]],
          GlobalEquivalentDomains: [],
        }),
      );

      await cli.parseAsync(["node", "bwadmin", "domains"]);

      expect(serviceContainer.apiService.getSettingsDomains).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("example.com");
      expect(stdout).toContain("example.org");
    });

    it("updates equivalent-domain rules via the settings API", async () => {
      serviceContainer.apiService.getSettingsDomains.mockResolvedValue(
        new DomainsResponse({ EquivalentDomains: [], GlobalEquivalentDomains: [] }),
      );
      serviceContainer.apiService.putSettingsDomains.mockResolvedValue(
        new DomainsResponse({ EquivalentDomains: [], GlobalEquivalentDomains: [] }),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "domains",
        "--equivalent",
        "example.com,example.org;other.com,other.net",
        "--excluded",
        "42,43",
      ]);

      expect(serviceContainer.apiService.putSettingsDomains).toHaveBeenCalledWith({
        equivalentDomains: [
          ["example.com", "example.org"],
          ["other.com", "other.net"],
        ],
        excludedGlobalEquivalentDomains: [42, 43],
      });
      expect(stdout).toContain("Domain rules updated");
    });
  });

  describe("otp", () => {
    it("requests a one-time password email", async () => {
      serviceContainer.userVerificationService.requestOTP.mockResolvedValue(undefined);

      await cli.parseAsync(["node", "bwadmin", "otp", "request"]);

      expect(serviceContainer.userVerificationService.requestOTP).toHaveBeenCalledTimes(1);
      expect(stdout).toContain("One-time password sent");
    });

    it("verifies a one-time password code", async () => {
      serviceContainer.userVerificationService.verifyUser.mockResolvedValue(true);

      await cli.parseAsync(["node", "bwadmin", "otp", "verify", "123456"]);

      expect(serviceContainer.userVerificationService.verifyUser).toHaveBeenCalledWith({
        type: VerificationType.OTP,
        secret: "123456",
      });
      expect(stdout).toContain("One-time password verified");
    });
  });

  describe("login", () => {
    it("logs in with password credentials and reports the session key", async () => {
      // The login action exits the process on success (exitImmediately), like apps/cli.
      await expect(
        cli.parseAsync(["node", "bwadmin", "login", "user@example.com", "password123"]),
      ).rejects.toThrow("process.exit:0");

      expect(serviceContainer.loginStrategyService.logIn).toHaveBeenCalledTimes(1);
      const creds = serviceContainer.loginStrategyService.logIn.mock
        .calls[0][0] as PasswordLoginCredentials;
      expect(creds).toBeInstanceOf(PasswordLoginCredentials);
      expect(stdout).toContain("You are logged in!");
      expect(stdout).toContain(B64_SESSION_KEY);
    });

    it("surfaces server rejection messages as-is", async () => {
      serviceContainer.loginStrategyService.logIn.mockRejectedValue(
        new ErrorResponse("Please verify your email before logging in.", 400),
      );

      await expect(
        cli.parseAsync(["node", "bwadmin", "login", "user@example.com", "password123"]),
      ).rejects.toThrow("process.exit:1");

      expect(stderr).toContain("Please verify your email before logging in.");
    });

    it("reports a two-factor challenge instead of completing login", async () => {
      const result = mockSuccessAuthResult();
      result.twoFactorProviders = { 1: {} }; // Authenticator
      serviceContainer.loginStrategyService.logIn.mockResolvedValue(result);
      serviceContainer.twoFactorService.getSupportedProviders.mockResolvedValue([]);

      await expect(
        cli.parseAsync(["node", "bwadmin", "login", "user@example.com", "password123"]),
      ).rejects.toThrow("process.exit:1");

      expect(stderr).toContain("No providers available for this client.");
    });
  });

  describe("unlock", () => {
    it("unlocks with the master password and returns a new session key", async () => {
      await cli.parseAsync(["node", "bwadmin", "unlock", "password123"]);

      expect(serviceContainer.unlockService.unlockWithMasterPassword).toHaveBeenCalledWith(
        TEST_USER_ID,
        "password123",
      );
      expect(stdout).toContain(B64_SESSION_KEY);
    });
  });

  describe("list", () => {
    const organization = {
      id: "10000000-0000-0000-0000-000000000001",
      name: "Acme",
      enabled: true,
      status: 2,
      type: 0,
    };

    beforeEach(() => {
      serviceContainer.organizationService.memberOrganizations$.mockReturnValue(
        of([
          mock<import("@bitwarden/common/admin-console/models/domain/organization").Organization>({
            ...organization,
            id: organization.id as import("@bitwarden/common/types/guid").OrganizationId,
          }),
        ]),
      );
      serviceContainer.organizationService.organizations$.mockReturnValue(
        of([
          mock<import("@bitwarden/common/admin-console/models/domain/organization").Organization>({
            ...organization,
            id: organization.id as import("@bitwarden/common/types/guid").OrganizationId,
          }),
        ]),
      );
      serviceContainer.organizationUserApiService.getAllUsers.mockResolvedValue({
        data: [
          {
            id: "member-1",
            email: "alice@example.com",
            name: "Alice",
            status: 2,
            type: 0,
            twoFactorEnabled: true,
          },
        ],
      } as any as Awaited<
        ReturnType<typeof serviceContainer.organizationUserApiService.getAllUsers>
      >);
    });

    it("lists organizations as a table by default", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "orgs"]);

      expect(serviceContainer.organizationService.memberOrganizations$).toHaveBeenCalled();
      expect(serviceContainer.organizationUserApiService.getAllUsers).not.toHaveBeenCalled();
      expect(stdout).toContain("Name");
      expect(stdout).toContain("Id");
      expect(stdout).toContain("Acme");
      expect(stdout).toContain("10000000-0000-0000-0000-000000000001");
    });

    it("lists members as a table with email, status, role and id", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "list",
        "members",
        "--orgid",
        "10000000-0000-0000-0000-000000000001",
      ]);

      expect(serviceContainer.organizationUserApiService.getAllUsers).toHaveBeenCalledWith(
        "10000000-0000-0000-0000-000000000001",
      );
      expect(stdout).toContain("alice@example.com");
      expect(stdout).toContain("Confirmed");
      expect(stdout).toContain("Owner");
      expect(stdout).toContain("member-1");
    });

    it("requires --orgid for members", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "members"]);

      expect(stderr).toContain("`organizationid` option is required.");
    });

    it("outputs machine-readable JSON with --raw", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "orgs", "--raw"]);

      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual([
        expect.objectContaining({
          object: "organization",
          id: "10000000-0000-0000-0000-000000000001",
          name: "Acme",
        }),
      ]);
    });
  });

  describe("events", () => {
    const ORG_ID = "10000000-0000-0000-0000-000000000001";
    const MEMBER_ID = "20000000-0000-0000-0000-000000000002";
    const CIPHER_ID = "30000000-0000-0000-0000-000000000003";

    beforeEach(() => {
      serviceContainer.apiService.getEventsOrganization.mockResolvedValue({
        data: [
          {
            type: 1100,
            date: "2026-11-01T00:00:00.000Z",
            actingUserId: "actor-1",
            ipAddress: "1.2.3.4",
          },
        ],
        continuationToken: "next-token",
      } as any as Awaited<ReturnType<typeof serviceContainer.apiService.getEventsOrganization>>);
      serviceContainer.apiService.getEventsOrganizationUser.mockResolvedValue({
        data: [{ type: 1101, date: "2026-11-02T00:00:00.000Z", actingUserId: "actor-2" }],
        continuationToken: null,
      } as any as Awaited<
        ReturnType<typeof serviceContainer.apiService.getEventsOrganizationUser>
      >);
      serviceContainer.apiService.getEventsCipher.mockResolvedValue({
        data: [{ type: 1107, date: "2026-11-03T00:00:00.000Z", actingUserId: "actor-3" }],
        continuationToken: null,
      } as any as Awaited<ReturnType<typeof serviceContainer.apiService.getEventsCipher>>);
    });

    it("lists org events as a table with type, date, acting user and ip", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "org", ORG_ID]);

      expect(serviceContainer.apiService.getEventsOrganization).toHaveBeenCalledWith(
        ORG_ID,
        undefined,
        undefined,
        undefined,
      );
      expect(stdout).toContain("Cipher_Created");
      expect(stdout).toContain("2026-11-01T00:00:00.000Z");
      expect(stdout).toContain("actor-1");
      expect(stdout).toContain("1.2.3.4");
    });

    it("passes start, end and continuation token filters", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "events",
        "org",
        ORG_ID,
        "--start",
        "2026-11-01",
        "--end",
        "2026-11-02",
        "--token",
        "abc",
      ]);

      expect(serviceContainer.apiService.getEventsOrganization).toHaveBeenCalledWith(
        ORG_ID,
        "2026-11-01",
        "2026-11-02",
        "abc",
      );
    });

    it("prints the continuation token for the next page", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "org", ORG_ID]);

      expect(stdout).toContain("next-token");
    });

    it("lists member events scoped to the organization", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "member", MEMBER_ID, "--orgid", ORG_ID]);

      expect(serviceContainer.apiService.getEventsOrganizationUser).toHaveBeenCalledWith(
        ORG_ID,
        MEMBER_ID,
        undefined,
        undefined,
        undefined,
      );
      expect(stdout).toContain("Cipher_Updated");
    });

    it("requires --orgid for member events", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "member", MEMBER_ID]);

      expect(stderr).toContain("`orgid` option is required.");
      expect(process.exitCode).toBe(1);
      expect(serviceContainer.apiService.getEventsOrganizationUser).not.toHaveBeenCalled();
    });

    it("lists cipher events", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "cipher", CIPHER_ID]);

      expect(serviceContainer.apiService.getEventsCipher).toHaveBeenCalledWith(
        CIPHER_ID,
        undefined,
        undefined,
        undefined,
      );
      expect(stdout).toContain("Cipher_ClientViewed");
    });

    it("rejects an unknown events object through the standard error contract", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "unknown", ORG_ID]);

      expect(stderr).toContain("Unknown events object: unknown");
      expect(process.exitCode).toBe(1);
    });

    it("outputs machine-readable JSON with --raw", async () => {
      await cli.parseAsync(["node", "bwadmin", "events", "cipher", CIPHER_ID, "--raw"]);

      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual(
        expect.objectContaining({
          data: [expect.objectContaining({ type: 1107, actingUserId: "actor-3" })],
        }),
      );
    });
  });

  describe("org settings", () => {
    const ORG_ID = "20000000-0000-0000-0000-000000000007";

    const organization = {
      id: ORG_ID,
      name: "Acme",
      businessName: "Acme Inc",
      billingEmail: "billing@acme.com",
      seats: 10,
    };

    beforeEach(() => {
      serviceContainer.organizationApiService.get.mockResolvedValue(organization as any);
      serviceContainer.organizationApiService.save.mockImplementation(
        async (_id: string, request: any) => ({
          ...organization,
          ...request,
        }),
      );
      serviceContainer.organizationApiService.getKeys.mockResolvedValue({
        publicKey: "org-public-key-b64",
        privateKey: "org-private-key-b64",
      } as any as Awaited<ReturnType<typeof serviceContainer.organizationApiService.getKeys>>);
      serviceContainer.organizationApiService.getApiKeyInformation.mockResolvedValue(
        mock<
          Awaited<ReturnType<typeof serviceContainer.organizationApiService.getApiKeyInformation>>
        >({
          data: [{ keyType: 0 }, { keyType: 2 }],
        } as any),
      );
    });

    it("shows organization settings as a table", async () => {
      await cli.parseAsync(["node", "bwadmin", "get", "org-settings", "--orgid", ORG_ID]);

      expect(serviceContainer.organizationApiService.get).toHaveBeenCalledWith(ORG_ID);
      expect(stdout).toContain("Acme");
      expect(stdout).toContain("billing@acme.com");
      expect(stdout).toContain("10");
    });

    it("outputs organization settings as JSON with --raw", async () => {
      await cli.parseAsync(["node", "bwadmin", "get", "org-settings", "--orgid", ORG_ID, "--raw"]);

      expect(JSON.parse(stdout)).toEqual(expect.objectContaining({ id: ORG_ID, name: "Acme" }));
    });

    it("updates the organization name", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "update",
        "org-settings",
        "--orgid",
        ORG_ID,
        "--name",
        "Renamed",
      ]);

      expect(serviceContainer.organizationApiService.save).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          name: "Renamed",
          billingEmail: "billing@acme.com",
          businessName: "Acme Inc",
        }),
      );
      expect(stdout).toContain("Renamed");
    });

    it("rejects an org-settings update with no options before calling the API", async () => {
      await cli.parseAsync(["node", "bwadmin", "update", "org-settings", "--orgid", ORG_ID]);

      expect(serviceContainer.organizationApiService.get).not.toHaveBeenCalled();
      expect(serviceContainer.organizationApiService.save).not.toHaveBeenCalled();
      expect(stderr).toContain("Nothing to update");
    });

    it("shows the organization public key", async () => {
      await cli.parseAsync(["node", "bwadmin", "get", "org-public-key", "--orgid", ORG_ID]);

      expect(serviceContainer.organizationApiService.getKeys).toHaveBeenCalledWith(ORG_ID);
      expect(stdout).toContain("org-public-key-b64");
    });

    it("shows organization api-key information", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "get",
        "org-api-key-info",
        "--orgid",
        ORG_ID,
        "--type",
        "0",
      ]);

      expect(serviceContainer.organizationApiService.getApiKeyInformation).toHaveBeenCalledWith(
        ORG_ID,
        0,
      );
      expect(stdout).toContain("Default");
      expect(stdout).toContain("Scim");
    });
  });

  describe("policies", () => {
    const ORG_ID = "20000000-0000-0000-0000-000000000002";

    beforeEach(() => {
      serviceContainer.policyApiService.getPolicies.mockResolvedValue({
        data: [
          { id: "policy-1", organizationId: ORG_ID, type: 1, enabled: true, data: null },
          { id: "policy-2", organizationId: ORG_ID, type: 2, enabled: false, data: null },
        ],
      } as any as Awaited<ReturnType<typeof serviceContainer.policyApiService.getPolicies>>);
      serviceContainer.policyApiService.getPolicy.mockResolvedValue({
        organizationId: ORG_ID,
        type: 1,
        enabled: false,
        data: { minutes: 30 },
      } as any as Awaited<ReturnType<typeof serviceContainer.policyApiService.getPolicy>>);
      serviceContainer.policyApiService.putPolicy.mockResolvedValue(
        {} as Awaited<ReturnType<typeof serviceContainer.policyApiService.putPolicy>>,
      );
    });

    it("lists policies as a table with type and enabled state", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "policies", "--orgid", ORG_ID]);

      expect(serviceContainer.policyApiService.getPolicies).toHaveBeenCalledWith(ORG_ID);
      expect(stdout).toContain("Type");
      expect(stdout).toContain("Enabled");
      expect(stdout).toContain("true");
      expect(stdout).toContain("false");
    });

    it("requires --orgid for policies", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "policies"]);

      expect(stderr).toContain("`organizationid` option is required.");
    });

    it("outputs policy JSON with --raw", async () => {
      await cli.parseAsync(["node", "bwadmin", "list", "policies", "--orgid", ORG_ID, "--raw"]);

      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual([
        expect.objectContaining({ object: "policy", id: "policy-1", type: 1, enabled: true }),
        expect.objectContaining({ object: "policy", id: "policy-2", type: 2, enabled: false }),
      ]);
    });

    it("shows a single policy", async () => {
      await cli.parseAsync(["node", "bwadmin", "policy", "1", "--orgid", ORG_ID]);

      expect(serviceContainer.policyApiService.getPolicy).toHaveBeenCalledWith(ORG_ID, 1);
      expect(stdout).toContain("false");
      expect(stdout).toContain("30");
    });

    it("enables a policy with GET then PUT, preserving existing data", async () => {
      await cli.parseAsync(["node", "bwadmin", "policy", "1", "--orgid", ORG_ID, "--enable"]);

      expect(serviceContainer.policyApiService.getPolicy).toHaveBeenCalledWith(ORG_ID, 1);
      expect(serviceContainer.policyApiService.putPolicy).toHaveBeenCalledWith(ORG_ID, 1, {
        policy: { enabled: true, data: { minutes: 30 } },
        metadata: null,
      });
    });

    it("disables a policy and merges --data into the existing config", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "policy",
        "1",
        "--orgid",
        ORG_ID,
        "--disable",
        "--data",
        '{"enableDowngrade": false}',
      ]);

      expect(serviceContainer.policyApiService.putPolicy).toHaveBeenCalledWith(ORG_ID, 1, {
        policy: { enabled: false, data: { minutes: 30, enableDowngrade: false } },
        metadata: null,
      });
    });

    it("updates policy data with --data alone, preserving the current enabled state", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "policy",
        "1",
        "--orgid",
        ORG_ID,
        "--data",
        '{"minutes": 60}',
      ]);

      expect(serviceContainer.policyApiService.putPolicy).toHaveBeenCalledWith(ORG_ID, 1, {
        policy: { enabled: false, data: { minutes: 60 } },
        metadata: null,
      });
      expect(stdout).toContain("Updated policy");
    });

    it("rejects --enable together with --disable", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "policy",
        "1",
        "--orgid",
        ORG_ID,
        "--enable",
        "--disable",
      ]);

      expect(serviceContainer.policyApiService.putPolicy).not.toHaveBeenCalled();
      expect(stderr).toContain("`enable` and `disable` are mutually exclusive.");
    });

    it("rejects invalid --data JSON", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "policy",
        "1",
        "--orgid",
        ORG_ID,
        "--enable",
        "--data",
        "{not json",
      ]);

      expect(serviceContainer.policyApiService.putPolicy).not.toHaveBeenCalled();
      expect(stderr).toContain("Invalid JSON");
    });
  });

  describe("collections", () => {
    const ORG_ID = "20000000-0000-0000-0000-000000000001";
    const COLLECTION_ID = "30000000-0000-0000-0000-000000000001";
    const GROUP_ID = "40000000-0000-0000-0000-000000000001";
    const MEMBER_ID = "50000000-0000-0000-0000-000000000001";

    const collectionView = (overrides: Partial<any> = {}) =>
      ({
        id: COLLECTION_ID,
        name: "Engineering",
        organizationId: ORG_ID,
        externalId: null,
        groups: [],
        users: [],
        ...overrides,
      }) as any;

    const accessSelection = (id: string, overrides: Partial<any> = {}) =>
      ({ id, readOnly: false, hidePasswords: false, manage: false, ...overrides }) as any;

    beforeEach(() => {
      collectionAdminService.collectionAdminViews$.mockReturnValue(of([collectionView()]));
    });

    it("lists collections as a table", async () => {
      serviceContainer.organizationService.organizations$.mockReturnValue(
        of([
          mock<import("@bitwarden/common/admin-console/models/domain/organization").Organization>({
            id: ORG_ID as import("@bitwarden/common/types/guid").OrganizationId,
            canViewAllCollections: true,
          }),
        ]),
      );
      serviceContainer.apiService.getCollections.mockResolvedValue({
        data: [{ id: COLLECTION_ID, organizationId: ORG_ID, name: "2 encrypted" }],
      } as any as Awaited<ReturnType<typeof serviceContainer.apiService.getCollections>>);
      serviceContainer.keyService.orgKeys$.mockReturnValue(of({ [ORG_ID]: {} }));
      serviceContainer.collectionService.decryptMany$.mockReturnValue(of([collectionView()]));
      serviceContainer.configService.getFeatureFlag.mockResolvedValue(false);

      await cli.parseAsync(["node", "bwadmin", "list", "collections", "--orgid", ORG_ID]);

      expect(serviceContainer.apiService.getCollections).toHaveBeenCalledWith(ORG_ID);
      expect(stdout).toContain("Name");
      expect(stdout).toContain("Engineering");
      expect(stdout).toContain(COLLECTION_ID);
    });

    it("creates a collection", async () => {
      collectionAdminService.create.mockResolvedValue({ id: COLLECTION_ID } as any);

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "create",
        "Engineering",
        "--orgid",
        ORG_ID,
      ]);

      expect(collectionAdminService.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Engineering", organizationId: ORG_ID }),
        TEST_USER_ID,
      );
      expect(stdout).toContain("Created collection Engineering.");
    });

    it("renames a collection via edit", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "edit",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
        "--name",
        "Platform",
      ]);

      expect(collectionAdminService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: COLLECTION_ID, name: "Platform" }),
        TEST_USER_ID,
      );
    });

    it("shows collection details with group and user access", async () => {
      collectionAdminService.collectionAdminViews$.mockReturnValue(
        of([
          collectionView({
            groups: [accessSelection(GROUP_ID, { manage: true })],
            users: [accessSelection(MEMBER_ID, { readOnly: true })],
          }),
        ]),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "details",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
      ]);

      expect(stdout).toContain("Engineering");
      expect(stdout).toContain(GROUP_ID);
      expect(stdout).toContain(MEMBER_ID);
    });

    it("outputs collection details as JSON with --raw", async () => {
      collectionAdminService.collectionAdminViews$.mockReturnValue(
        of([
          collectionView({
            groups: [accessSelection(GROUP_ID, { manage: true })],
            users: [accessSelection(MEMBER_ID, { readOnly: true })],
          }),
        ]),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "details",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
        "--raw",
      ]);

      const parsed = JSON.parse(stdout);
      expect(parsed).toEqual(
        expect.objectContaining({
          name: "Engineering",
          groups: [expect.objectContaining({ id: GROUP_ID, manage: true })],
          users: [expect.objectContaining({ id: MEMBER_ID, readOnly: true })],
        }),
      );
    });

    it("assigns user access to a collection", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "user-access",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
        "--memberid",
        MEMBER_ID,
        "--readonly",
      ]);

      expect(collectionAdminService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          users: [accessSelection(MEMBER_ID, { readOnly: true })],
        }),
        TEST_USER_ID,
      );
    });

    it("revokes user access from a collection", async () => {
      collectionAdminService.collectionAdminViews$.mockReturnValue(
        of([collectionView({ users: [accessSelection(MEMBER_ID)] })]),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "user-access",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
        "--memberid",
        MEMBER_ID,
        "--remove",
      ]);

      expect(collectionAdminService.update).toHaveBeenCalledWith(
        expect.objectContaining({ users: [] }),
        TEST_USER_ID,
      );
    });

    it("assigns group access to a collection", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "group-access",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
        "--groupid",
        GROUP_ID,
        "--manage",
      ]);

      expect(collectionAdminService.update).toHaveBeenCalledWith(
        expect.objectContaining({
          groups: [accessSelection(GROUP_ID, { manage: true })],
        }),
        TEST_USER_ID,
      );
    });

    it("bulk-updates access across collections", async () => {
      const secondCollection = "30000000-0000-0000-0000-000000000002";

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "bulk-access",
        "--orgid",
        ORG_ID,
        "--collectionid",
        COLLECTION_ID,
        "--collectionid",
        secondCollection,
        "--groupid",
        GROUP_ID,
        "--memberid",
        MEMBER_ID,
        "--manage",
      ]);

      expect(collectionAdminService.bulkAssignAccess).toHaveBeenCalledWith(
        ORG_ID,
        [COLLECTION_ID, secondCollection],
        [accessSelection(MEMBER_ID, { manage: true })],
        [accessSelection(GROUP_ID, { manage: true })],
      );
    });

    it("deletes a collection", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "delete",
        COLLECTION_ID,
        "--orgid",
        ORG_ID,
      ]);

      expect(collectionAdminService.delete).toHaveBeenCalledWith(ORG_ID, COLLECTION_ID);
    });

    it("bulk-deletes collections", async () => {
      const secondCollection = "30000000-0000-0000-0000-000000000002";

      await cli.parseAsync([
        "node",
        "bwadmin",
        "collection",
        "bulk-delete",
        "--orgid",
        ORG_ID,
        "--collectionid",
        COLLECTION_ID,
        "--collectionid",
        secondCollection,
      ]);

      expect(serviceContainer.apiService.deleteManyCollections).toHaveBeenCalledWith(ORG_ID, [
        COLLECTION_ID,
        secondCollection,
      ]);
    });
  });

  describe("member write operations", () => {
    const ORG_ID = "10000000-0000-0000-0000-000000000001";
    const MEMBER_ID_1 = "30000000-0000-0000-0000-000000000001";
    const MEMBER_ID_2 = "30000000-0000-0000-0000-000000000002";
    const ACCOUNT_USER_ID = "40000000-0000-0000-0000-000000000001";

    beforeEach(() => {
      // Member-confirm crypto delegation targets: the org key and the two
      // encryptService calls made inside libs/ member-confirm services.
      serviceContainer.keyService.orgKeys$.mockReturnValue(
        of({ [ORG_ID]: { mockOrgKey: true } as any }),
      );
      serviceContainer.encryptService.encapsulateKeyUnsigned.mockResolvedValue({
        encryptedString: "2.member-key",
      } as any as Awaited<
        ReturnType<typeof serviceContainer.encryptService.encapsulateKeyUnsigned>
      >);
      serviceContainer.encryptService.encryptString.mockResolvedValue({
        encryptedString: "2.collection-name",
      } as any as Awaited<ReturnType<typeof serviceContainer.encryptService.encryptString>>);
      serviceContainer.organizationUserApiService.getOrganizationUser.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<typeof serviceContainer.organizationUserApiService.getOrganizationUser>
          >
        >({
          id: MEMBER_ID_1,
          userId: ACCOUNT_USER_ID,
          status: 1, // Accepted
        } as any),
      );
      serviceContainer.apiService.getUserPublicKey.mockResolvedValue({
        publicKey: "cHVibGljLWtleQ", // "public-key"
      } as any as Awaited<ReturnType<typeof serviceContainer.apiService.getUserPublicKey>>);
    });

    it("invite posts an invite request with parsed emails and role", async () => {
      await cli.parseAsync([
        "node",
        "bwadmin",
        "invite",
        "--orgid",
        ORG_ID,
        "--email",
        "alice@example.com,bob@example.com",
        "--role",
        "admin",
      ]);

      expect(
        serviceContainer.organizationUserApiService.postOrganizationUserInvite,
      ).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({
          emails: ["alice@example.com", "bob@example.com"],
          type: OrganizationUserType.Admin,
        }),
      );
    });

    it("invite requires --orgid", async () => {
      await cli.parseAsync(["node", "bwadmin", "invite", "--email", "alice@example.com"]);

      expect(stderr).toContain("`orgid` option is required.");
    });

    it("reinvite sends the per-user reinvite endpoint", async () => {
      serviceContainer.apiService.send.mockResolvedValue(null);

      await cli.parseAsync(["node", "bwadmin", "reinvite", MEMBER_ID_1, "--orgid", ORG_ID]);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "POST",
        `/organizations/${ORG_ID}/users/${MEMBER_ID_1}/reinvite`,
        null,
        true,
        false,
      );
    });

    it("reinvite bulk reports per-item success and failure", async () => {
      serviceContainer.apiService.send.mockResolvedValue({
        data: [
          { Id: MEMBER_ID_1, Error: null },
          { Id: MEMBER_ID_2, Error: "User is not Invited" },
        ],
      } as Awaited<ReturnType<typeof serviceContainer.apiService.send>>);

      await cli.parseAsync([
        "node",
        "bwadmin",
        "reinvite",
        MEMBER_ID_1,
        MEMBER_ID_2,
        "--orgid",
        ORG_ID,
      ]);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "POST",
        `/organizations/${ORG_ID}/users/reinvite`,
        expect.objectContaining({ ids: [MEMBER_ID_1, MEMBER_ID_2] }),
        true,
        true,
      );
      expect(stdout).toContain(MEMBER_ID_1);
      expect(stdout).toContain("User is not Invited");
      expect(process.exitCode).toBe(1);
    });

    it("remove deletes a single member", async () => {
      await cli.parseAsync(["node", "bwadmin", "remove", MEMBER_ID_1, "--orgid", ORG_ID]);

      expect(
        serviceContainer.organizationUserApiService.removeOrganizationUser,
      ).toHaveBeenCalledWith(ORG_ID, MEMBER_ID_1);
    });

    it("remove bulk deletes many members and reports per-item results", async () => {
      serviceContainer.organizationUserApiService.deleteManyOrganizationUsers.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<
              typeof serviceContainer.organizationUserApiService.deleteManyOrganizationUsers
            >
          >
        >({
          data: [
            { id: MEMBER_ID_1, error: null },
            { id: MEMBER_ID_2, error: "cannot delete last owner" },
          ],
        } as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "remove",
        MEMBER_ID_1,
        MEMBER_ID_2,
        "--orgid",
        ORG_ID,
      ]);

      expect(
        serviceContainer.organizationUserApiService.deleteManyOrganizationUsers,
      ).toHaveBeenCalledWith(ORG_ID, [MEMBER_ID_1, MEMBER_ID_2]);
      expect(stdout).toContain(MEMBER_ID_2);
      expect(stdout).toContain("cannot delete last owner");
      expect(process.exitCode).toBe(1);
    });

    it("revoke revokes a single member", async () => {
      await cli.parseAsync(["node", "bwadmin", "revoke", MEMBER_ID_1, "--orgid", ORG_ID]);

      expect(
        serviceContainer.organizationUserApiService.revokeOrganizationUser,
      ).toHaveBeenCalledWith(ORG_ID, MEMBER_ID_1);
    });

    it("revoke bulk revokes many members", async () => {
      serviceContainer.organizationUserApiService.revokeManyOrganizationUsers.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<
              typeof serviceContainer.organizationUserApiService.revokeManyOrganizationUsers
            >
          >
        >({
          data: [
            { id: MEMBER_ID_1, error: null },
            { id: MEMBER_ID_2, error: null },
          ],
        } as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "revoke",
        MEMBER_ID_1,
        MEMBER_ID_2,
        "--orgid",
        ORG_ID,
      ]);

      expect(
        serviceContainer.organizationUserApiService.revokeManyOrganizationUsers,
      ).toHaveBeenCalledWith(ORG_ID, [MEMBER_ID_1, MEMBER_ID_2]);
      expect(process.exitCode).toBe(0);
    });

    it("restore restores a single member through the organization user service", async () => {
      await cli.parseAsync(["node", "bwadmin", "restore", MEMBER_ID_1, "--orgid", ORG_ID]);

      expect(
        serviceContainer.organizationUserApiService.restoreOrganizationUser,
      ).toHaveBeenCalledWith(
        ORG_ID,
        MEMBER_ID_1,
        expect.objectContaining({
          defaultUserCollectionName: "2.collection-name",
        }),
      );
    });

    it("restore bulk restores many members", async () => {
      serviceContainer.organizationUserApiService.restoreManyOrganizationUsers.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<
              typeof serviceContainer.organizationUserApiService.restoreManyOrganizationUsers
            >
          >
        >({
          data: [{ id: MEMBER_ID_1, error: null }],
        } as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "restore",
        MEMBER_ID_1,
        MEMBER_ID_2,
        "--orgid",
        ORG_ID,
      ]);

      expect(
        serviceContainer.organizationUserApiService.restoreManyOrganizationUsers,
      ).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({ ids: [MEMBER_ID_1, MEMBER_ID_2] }));
    });

    it("confirm confirms a single member via the existing member-confirm crypto service", async () => {
      await cli.parseAsync(["node", "bwadmin", "confirm", MEMBER_ID_1, "--orgid", ORG_ID]);

      expect(serviceContainer.apiService.getUserPublicKey).toHaveBeenCalledWith(ACCOUNT_USER_ID);
      expect(
        serviceContainer.organizationUserApiService.postOrganizationUserConfirm,
      ).toHaveBeenCalledWith(
        ORG_ID,
        MEMBER_ID_1,
        expect.objectContaining({
          key: "2.member-key",
          defaultUserCollectionName: "2.collection-name",
        }),
      );
    });

    it("confirm bulk confirms members and reports per-item results", async () => {
      serviceContainer.organizationUserApiService.postOrganizationUsersPublicKey.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<
              typeof serviceContainer.organizationUserApiService.postOrganizationUsersPublicKey
            >
          >
        >({
          data: [
            { id: MEMBER_ID_1, userId: ACCOUNT_USER_ID, key: "cHVibGljLWtleQ" },
            // MEMBER_ID_2 has no public key entry: it must be reported as failed
          ],
        } as any),
      );
      serviceContainer.organizationUserApiService.postOrganizationUserBulkConfirm.mockResolvedValue(
        mock<
          Awaited<
            ReturnType<
              typeof serviceContainer.organizationUserApiService.postOrganizationUserBulkConfirm
            >
          >
        >({
          data: [{ id: MEMBER_ID_1, error: null }],
        } as any),
      );

      await cli.parseAsync([
        "node",
        "bwadmin",
        "confirm",
        MEMBER_ID_1,
        MEMBER_ID_2,
        "--orgid",
        ORG_ID,
      ]);

      expect(
        serviceContainer.organizationUserApiService.postOrganizationUsersPublicKey,
      ).toHaveBeenCalledWith(ORG_ID, [MEMBER_ID_1, MEMBER_ID_2], TEST_USER_ID);
      expect(
        serviceContainer.organizationUserApiService.postOrganizationUserBulkConfirm,
      ).toHaveBeenCalledWith(
        ORG_ID,
        expect.objectContaining({ keys: [{ id: MEMBER_ID_1, key: "2.member-key" }] }),
      );
      expect(stdout).toContain(MEMBER_ID_1);
      expect(stdout).toContain(MEMBER_ID_2);
      expect(process.exitCode).toBe(1);
    });
  });

  describe("config", () => {
    it("saves the server URL", async () => {
      Object.defineProperty(serviceContainer.accountService, "activeAccount$", {
        value: of(null),
        configurable: true,
      });

      await cli.parseAsync(["node", "bwadmin", "config", "server", "https://vw.example.com"]);

      expect(serviceContainer.environmentService.setEnvironment).toHaveBeenCalledWith(
        "Self-hosted", // Region.SelfHosted
        expect.objectContaining({ base: "https://vw.example.com" }),
      );
      expect(stdout).toContain("Saved setting `config`.");
    });
  });
});
