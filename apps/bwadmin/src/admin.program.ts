import * as chalk from "chalk";
import { program, Command, OptionValues } from "commander";
import { firstValueFrom } from "rxjs";

import {
  CollectionAdminService,
  DefaultCollectionAdminService,
} from "@bitwarden/admin-console/common";
import { LockCommand } from "@bitwarden/cli/auth/commands/lock.command";
import { LoginCommand } from "@bitwarden/cli/auth/commands/login.command";
import { LogoutCommand } from "@bitwarden/cli/auth/commands/logout.command";
import { BaseProgram } from "@bitwarden/cli/base-program";
import { ListCommand } from "@bitwarden/cli/commands/list.command";
import { UnlockCommand } from "@bitwarden/cli/key-management/commands/unlock.command";
import { Response } from "@bitwarden/cli/models/response";
import { ListResponse } from "@bitwarden/cli/models/response/list.response";
import { MessageResponse } from "@bitwarden/cli/models/response/message.response";
import { StringResponse } from "@bitwarden/cli/models/response/string.response";
import { TemplateResponse } from "@bitwarden/cli/models/response/template.response";
import { ConfigCommand } from "@bitwarden/cli/platform/commands/config.command";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";
import { CliUtils } from "@bitwarden/cli/utils";
import { SyncCommand } from "@bitwarden/cli/vault/sync.command";
import {
  OrganizationApiKeyType,
  OrganizationUserStatusType,
  OrganizationUserType,
  PolicyType,
} from "@bitwarden/common/admin-console/enums";
import {
  CollectionAccessSelectionView,
  CollectionAdminView,
} from "@bitwarden/common/admin-console/models/collections";
import { OrganizationUpdateRequest } from "@bitwarden/common/admin-console/models/request/organization-update.request";
import { VerificationType } from "@bitwarden/common/auth/enums/verification-type";
import { getUserId } from "@bitwarden/common/auth/services/account.service";
import { EventResponse, EventType } from "@bitwarden/common/dirt/event-logs";
import { withPasswordManagerSdk } from "@bitwarden/common/key-management/utils";
import { UpdateDomainsRequest } from "@bitwarden/common/models/request/update-domains.request";
import { ListResponse as EventListResponse } from "@bitwarden/common/models/response/list.response";
import { Utils } from "@bitwarden/common/platform/misc/utils";
// eslint-disable-next-line no-restricted-imports
import { Argon2KdfConfig, KdfConfig, KdfType, PBKDF2KdfConfig } from "@bitwarden/legacy-crypto";
import { UserKeyRotationService } from "@bitwarden/user-crypto-management";

import { CliUserCryptoDialogService } from "./account-security/cli-user-crypto-dialog.service";
import { GroupCommand } from "./commands/group.command";
import { MemberWriteCommand, MemberWriteResult } from "./member-write.command";
import { RegisterCommand } from "./register.command";
import { TableColumn, writeTable } from "./table";
import { registerTwoFactorCommands } from "./two-factor.program";

const writeLn = CliUtils.writeLn;

// Numeric TS enums support reverse mapping; fall back to the raw value otherwise.
const enumName = (e: object, value: number) => (e as any)[value] ?? value;

/**
 * Registers the shared auth/session commands (login, unlock, lock, sync, logout, config)
 * on a Commander program, mirroring apps/cli behavior for web-exclusive administration.
 */
export class AdminProgram extends BaseProgram {
  constructor(
    serviceContainer: ServiceContainer,
    private cli: Command = program,
    private getCollectionAdminService: () => CollectionAdminService = () =>
      new DefaultCollectionAdminService(
        serviceContainer.apiService,
        serviceContainer.keyService,
        serviceContainer.encryptService,
        serviceContainer.collectionService,
        serviceContainer.organizationService,
      ),
  ) {
    super(serviceContainer);
  }

  async register() {
    this.cli
      .name("bwadmin")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminCliForWebExclusiveVaultAdministrationOnSelfHostedServers",
        ),
      )
      .option(
        "--pretty",
        this.serviceContainer.i18nService.t("bwadminFormatOutputJsonIsTabbedWithTwoSpaces"),
      )
      .option(
        "--raw",
        this.serviceContainer.i18nService.t("bwadminReturnRawOutputInsteadOfADescriptiveMessage"),
      )
      .option("--json", this.serviceContainer.i18nService.t("bwadminReturnJsonOutput"))
      .option(
        "--response",
        this.serviceContainer.i18nService.t("bwadminReturnAJsonFormattedVersionOfResponseOutput"),
      )
      .option(
        "--cleanexit",
        this.serviceContainer.i18nService.t(
          "bwadminExitWithASuccessExitCode0UnlessAnErrorIsThrown",
        ),
      )
      .option("--quiet", this.serviceContainer.i18nService.t("bwadminDonTReturnAnythingToStdout"))
      .option(
        "--nointeraction",
        this.serviceContainer.i18nService.t("bwadminDoNotPromptForInteractiveUserInput"),
      )
      .option(
        "--session <session>",
        this.serviceContainer.i18nService.t("bwadminPassSessionKeyInsteadOfReadingFromEnv"),
      )
      .version(
        await this.serviceContainer.platformUtilsService.getApplicationVersion(),
        "-v, --version",
      );

    this.cli.on("option:pretty", () => {
      process.env.BW_PRETTY = "true";
    });
    this.cli.on("option:raw", () => {
      process.env.BW_RAW = "true";
    });
    this.cli.on("option:json", () => {
      process.env.BW_RAW = "true";
    });
    this.cli.on("option:quiet", () => {
      process.env.BW_QUIET = "true";
    });
    this.cli.on("option:response", () => {
      process.env.BW_RESPONSE = "true";
    });
    this.cli.on("option:cleanexit", () => {
      process.env.BW_CLEANEXIT = "true";
    });
    this.cli.on("option:nointeraction", () => {
      process.env.BW_NOINTERACTION = "true";
    });
    this.cli.on("option:session", (key) => {
      process.env.BW_SESSION = key;
    });
    this.cli.on("command:*", () => {
      writeLn(
        chalk.redBright(
          this.serviceContainer.i18nService.t("bwadminInvalidCommand") + this.cli.args.join(" "),
        ),
        false,
        true,
      );
      writeLn(
        this.serviceContainer.i18nService.t("bwadminSeeHelpForAListOfAvailableCommands"),
        true,
        true,
      );
      process.exitCode = 1;
    });

    this.cli
      .command("login [email] [password]")
      .description(this.serviceContainer.i18nService.t("bwadminLogIntoAUserAccount"))
      .option("--method <method>", this.serviceContainer.i18nService.t("bwadminTwoStepLoginMethod"))
      .option("--code <code>", this.serviceContainer.i18nService.t("bwadminTwoStepLoginCode"))
      .option(
        "--passwordenv <passwordenv>",
        this.serviceContainer.i18nService.t("bwadminEnvironmentVariableStoringYourPassword"),
      )
      .option(
        "--passwordfile <passwordfile>",
        this.serviceContainer.i18nService.t(
          "bwadminPathToAFileContainingYourPasswordAsItsFirstLine",
        ),
      )
      .action(async (email: string, password: string, options: OptionValues) => {
        await this.exitIfAuthed();
        const command = new LoginCommand(
          this.serviceContainer.loginStrategyService,
          this.serviceContainer.authService,
          this.serviceContainer.twoFactorApiService,
          this.serviceContainer.cryptoFunctionService,
          this.serviceContainer.environmentService,
          this.serviceContainer.passwordGenerationService,
          this.serviceContainer.platformUtilsService,
          this.serviceContainer.accountService,
          this.serviceContainer.twoFactorService,
          this.serviceContainer.syncService,
          this.serviceContainer.keyConnectorService,
          async () => await this.serviceContainer.logout(),
          this.serviceContainer.ssoUrlService,
          this.serviceContainer.i18nService,
          this.serviceContainer.masterPasswordService,
          this.serviceContainer.userDecryptionOptionsService,
          this.serviceContainer.encryptedMigrator,
        );
        const response = await command.run(email, password, options);
        this.processResponse(response, true);
      });

    this.cli
      .command("logout")
      .description(this.serviceContainer.i18nService.t("bwadminLogOutOfTheCurrentUserAccount"))
      .action(async () => {
        await this.exitIfNotAuthed();
        const command = new LogoutCommand(
          this.serviceContainer.authService,
          this.serviceContainer.i18nService,
          async () => await this.serviceContainer.logout(),
        );
        const response = await command.run();
        this.processResponse(response);
      });

    this.cli
      .command("register <url>")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminFinishAccountRegistrationFromAFinishSignupEmailLink",
        ),
      )
      .option(
        "--password <password>",
        this.serviceContainer.i18nService.t("bwadminUseTheGivenInitialPasswordWithoutPrompting"),
      )
      .option(
        "--generate",
        this.serviceContainer.i18nService.t("bwadminGenerateARandomInitialPasswordAndPrintItOnce"),
      )
      .action(async (url: string, options: OptionValues) => {
        const command = new RegisterCommand(
          this.serviceContainer.apiService,
          this.serviceContainer.legacyCompatKeyService,
          this.serviceContainer.masterPasswordService,
          this.serviceContainer.passwordPreloginService,
          this.serviceContainer.userVerificationService,
          this.serviceContainer.logService,
          this.serviceContainer.accountService,
          this.serviceContainer.environmentService,
          this.serviceContainer.passwordGenerationService,
          this.serviceContainer.i18nService,
        );
        const response = await command.run(url, options);
        this.processResponse(response);
      });

    this.cli
      .command("lock")
      .description(
        this.serviceContainer.i18nService.t("bwadminLockTheVaultAndDestroyActiveSessionKeys"),
      )
      .action(async () => {
        const userId = await this.exitIfNotAuthed();

        if (await this.serviceContainer.keyConnectorService.getUsesKeyConnector(userId)) {
          const logoutCommand = new LogoutCommand(
            this.serviceContainer.authService,
            this.serviceContainer.i18nService,
            async () => await this.serviceContainer.logout(),
          );
          await logoutCommand.run();
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t(
                "bwadminYouCannotLockYourVaultBecauseYouAreUsingKeyConnector",
              ) +
                this.serviceContainer.i18nService.t(
                  "bwadminToProtectYourVaultYouHaveBeenLoggedOut",
                ),
            ),
            true,
          );
          return;
        }

        const command = new LockCommand(
          this.serviceContainer.lockService,
          this.serviceContainer.accountService,
        );
        const response = await command.run();
        this.processResponse(response);
      });

    this.cli
      .command("unlock [password]")
      .description(
        this.serviceContainer.i18nService.t("bwadminUnlockTheVaultAndReturnANewSessionKey"),
      )
      .option(
        "--passwordenv <passwordenv>",
        this.serviceContainer.i18nService.t("bwadminEnvironmentVariableStoringYourPassword"),
      )
      .option(
        "--passwordfile <passwordfile>",
        this.serviceContainer.i18nService.t(
          "bwadminPathToAFileContainingYourPasswordAsItsFirstLine",
        ),
      )
      .action(async (password, cmd) => {
        await this.exitIfNotAuthed();
        const command = new UnlockCommand(
          this.serviceContainer.accountService,
          this.serviceContainer.logService,
          this.serviceContainer.keyConnectorService,
          this.serviceContainer.environmentService,
          this.serviceContainer.organizationApiService,
          async () => await this.serviceContainer.logout(),
          this.serviceContainer.i18nService,
          this.serviceContainer.encryptedMigrator,
          this.serviceContainer.unlockService,
          this.serviceContainer.biometricsService,
        );
        const response = await command.run(password, cmd);
        this.processResponse(response);
      });

    this.cli
      .command("sync")
      .description(this.serviceContainer.i18nService.t("bwadminPullTheLatestVaultDataFromServer"))
      .option("-f, --force", this.serviceContainer.i18nService.t("bwadminForceAFullSync"))
      .option("--last", this.serviceContainer.i18nService.t("bwadminGetTheLastSyncDate"))
      .action(async (cmd) => {
        await this.exitIfNotAuthed();
        const command = new SyncCommand(this.serviceContainer.syncService);
        const response = await command.run(cmd);
        this.processResponse(response);
        writeLn("", true);
      });

    this.cli
      .command("config <setting> [value]")
      .description(this.serviceContainer.i18nService.t("bwadminConfigureCliSettings"))
      .option(
        "--web-vault <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomWebVaultUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .option(
        "--api <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomApiUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .option(
        "--identity <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomIdentityUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .option(
        "--icons <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomIconsServiceUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .option(
        "--notifications <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomNotificationsUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .option(
        "--events <url>",
        this.serviceContainer.i18nService.t(
          "bwadminProvidesACustomEventsUrlThatDiffersFromTheBaseUrl",
        ),
      )
      .action(async (setting, value, options) => {
        const command = new ConfigCommand(
          this.serviceContainer.environmentService,
          this.serviceContainer.accountService,
        );
        const response = await command.run(setting, value, options);
        this.processResponse(response);
      });

    this.cli
      .command("update-password [currentPassword] [newPassword]")
      .description(
        this.serviceContainer.i18nService.t("bwadminChangeTheMasterPasswordAndReEncryptTheVault"),
      )
      .option("--hint <hint>", this.serviceContainer.i18nService.t("bwadminMasterPasswordHint"))
      .action(async (currentPassword: string, newPassword: string, options: OptionValues) => {
        const userId = await this.exitIfNotAuthed();

        if (currentPassword == null || newPassword == null) {
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t("bwadminCurrentAndNewPasswordsAreRequired"),
            ),
          );
          return;
        }

        // Reuses the SDK key-rotation path for vault re-encryption; no local crypto.
        const rotationService = new UserKeyRotationService(
          this.serviceContainer.sdkService,
          this.serviceContainer.logService,
          new CliUserCryptoDialogService(this.serviceContainer.i18nService),
        );

        try {
          const changed = await rotationService.changePasswordAndRotateUserKey(
            currentPassword,
            newPassword,
            options.hint,
            userId,
          );
          if (!changed) {
            throw new Error(this.serviceContainer.i18nService.t("bwadminKeyRotationWasAborted"));
          }
          this.processResponse(
            Response.success(
              new MessageResponse(
                this.serviceContainer.i18nService.t("bwadminMasterPasswordChanged"),
                null,
              ),
            ),
          );
        } catch (e) {
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t(
                "bwadminMasterPasswordChangeFailed1",
                (e as Error).message,
              ),
            ),
          );
        }
      });

    this.cli
      .command("kdf [masterPassword]")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminShowKdfSettingsOrUpdateThemPassTheMasterPasswordAndType",
        ),
      )
      .option(
        "--type <type>",
        this.serviceContainer.i18nService.t("bwadminKdfType0Pbkdf2Sha2561Argon2id"),
      )
      .option(
        "--iterations <iterations>",
        this.serviceContainer.i18nService.t("bwadminPbkdf2OrArgon2idIterations"),
      )
      .option(
        "--memory <memory>",
        this.serviceContainer.i18nService.t("bwadminArgon2idMemoryInMib"),
      )
      .option(
        "--parallelism <parallelism>",
        this.serviceContainer.i18nService.t("bwadminArgon2idParallelism"),
      )
      .action(async (masterPassword: string, options: OptionValues) => {
        const userId = await this.exitIfNotAuthed();

        if (options.type == null) {
          const kdf = await this.serviceContainer.kdfConfigService.getKdfConfig(userId);
          this.processResponse(
            Response.success(
              new TemplateResponse({
                kdfType: KdfType[kdf.kdfType],
                iterations: kdf.iterations,
                ...(kdf.kdfType === KdfType.Argon2id
                  ? {
                      memory: (kdf as Argon2KdfConfig).memory,
                      parallelism: (kdf as Argon2KdfConfig).parallelism,
                    }
                  : {}),
              }),
            ),
          );
          return;
        }

        if (masterPassword == null) {
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t(
                "bwadminTheMasterPasswordIsRequiredToUpdateKdfSettings",
              ),
            ),
          );
          return;
        }

        try {
          const newKdf: KdfConfig =
            parseInt(options.type, 10) === KdfType.Argon2id
              ? new Argon2KdfConfig(
                  parseInt(options.iterations, 10),
                  parseInt(options.memory, 10),
                  parseInt(options.parallelism, 10),
                )
              : new PBKDF2KdfConfig(parseInt(options.iterations, 10));

          newKdf.validateKdfConfigForSetting();

          await withPasswordManagerSdk(userId, this.serviceContainer.sdkService, async (sdk) =>
            sdk.user_crypto_management().change_kdf(masterPassword, newKdf.toSdkConfig()),
          );

          this.processResponse(
            Response.success(
              new MessageResponse(
                this.serviceContainer.i18nService.t("bwadminKdfSettingsUpdated"),
                null,
              ),
            ),
          );
        } catch (e) {
          this.processResponse(Response.error((e as Error).message));
        }
      });

    this.cli
      .command("domains")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminShowEquivalentDomainRulesOrUpdateThemViaEquivalentExcluded",
        ),
      )
      .option(
        "--equivalent <equivalent>",
        this.serviceContainer.i18nService.t(
          "bwadminSemicolonSeparatedGroupsOfCommaSeparatedEquivalentDomains",
        ),
      )
      .option(
        "--excluded <excluded>",
        this.serviceContainer.i18nService.t(
          "bwadminCommaSeparatedGlobalEquivalentDomainIdsToExclude",
        ),
      )
      .action(async (options: OptionValues) => {
        await this.exitIfNotAuthed();

        if (options.equivalent == null && options.excluded == null) {
          const domains = await this.serviceContainer.apiService.getSettingsDomains();
          this.processResponse(
            Response.success(
              new TemplateResponse({
                equivalentDomains: domains.equivalentDomains,
                globalEquivalentDomains: domains.globalEquivalentDomains,
              }),
            ),
          );
          return;
        }

        const current = await this.serviceContainer.apiService.getSettingsDomains();
        const request = new UpdateDomainsRequest();
        request.equivalentDomains =
          options.equivalent != null
            ? (options.equivalent as string)
                .split(";")
                .map((group) => group.split(",").map((domain) => domain.trim()))
            : current.equivalentDomains;
        request.excludedGlobalEquivalentDomains =
          options.excluded != null
            ? (options.excluded as string).split(",").map((id) => parseInt(id.trim(), 10))
            : current.globalEquivalentDomains.filter((d) => d.excluded).map((d) => d.type);

        await this.serviceContainer.apiService.putSettingsDomains(request);
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminDomainRulesUpdated"),
              null,
            ),
          ),
        );
      });

    const otp = this.cli
      .command("otp")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminRequestOrVerifyAOneTimePasswordOtpSentToTheAccountEmail",
        ),
      );

    otp
      .command("request")
      .description(this.serviceContainer.i18nService.t("bwadminRequestAOneTimePasswordEmail"))
      .action(async () => {
        await this.exitIfNotAuthed();
        await this.serviceContainer.userVerificationService.requestOTP();
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminOneTimePasswordSentCheckYourEmail"),
              null,
            ),
          ),
        );
      });

    otp
      .command("verify <code>")
      .description(this.serviceContainer.i18nService.t("bwadminVerifyAOneTimePasswordCode"))
      .action(async (code: string) => {
        await this.exitIfNotAuthed();
        await this.serviceContainer.userVerificationService.verifyUser({
          type: VerificationType.OTP,
          secret: code,
        });
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminOneTimePasswordVerified"),
              null,
            ),
          ),
        );
      });

    this.cli
      .command("list <object>")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminListOrganizationsOrgsOrganizationMembersMembersGroupsGroupsCollectionsCollectionsOrPoliciesPolicies",
        ),
      )
      .option(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t(
          "bwadminOrganizationIdRequiredForMembersGroupsCollectionsAndPolicies",
        ),
      )
      .option(
        "--search <search>",
        this.serviceContainer.i18nService.t("bwadminSearchTermsForOrganizations"),
      )
      .action(async (object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        if (object.toLowerCase() === "groups") {
          if (!options.orgid) {
            this.processResponse(
              Response.error(
                this.serviceContainer.i18nService.t("bwadminOrganizationidOptionIsRequired"),
              ),
              true,
            );
            return;
          }
          const groupCommand = new GroupCommand(this.serviceContainer);
          this.processListResponse(
            await groupCommand.list(options.orgid),
            this.listColumns(object),
          );
          return;
        }
        if (object.toLowerCase() === "policies") {
          await this.listPolicies(options.orgid);
          return;
        }
        const aliases: Record<string, string> = {
          orgs: "organizations",
          members: "org-members",
          collections: "org-collections",
        };
        const command = new ListCommand(
          this.serviceContainer.cipherService,
          this.serviceContainer.folderService,
          this.serviceContainer.collectionService,
          this.serviceContainer.organizationService,
          this.serviceContainer.searchService,
          this.serviceContainer.organizationUserApiService,
          this.serviceContainer.apiService,
          this.serviceContainer.eventCollectionService,
          this.serviceContainer.accountService,
          this.serviceContainer.keyService,
          this.serviceContainer.cliRestrictedItemTypesService,
          this.serviceContainer.cipherArchiveService,
          this.serviceContainer.configService,
        );
        const response = await command.run(aliases[object.toLowerCase()] ?? object, {
          organizationid: options.orgid,
          search: options.search,
        });
        this.processListResponse(response, this.listColumns(object));
      });

    const memberWriteCommands = ["invite", "reinvite", "remove", "revoke", "restore", "confirm"];

    for (const name of memberWriteCommands) {
      this.cli
        .command(`${name} [ids...]`)
        .description(
          name === "invite"
            ? this.serviceContainer.i18nService.t("bwadminInviteMembersByEmailToAnOrganization")
            : this.serviceContainer.i18nService.t(
                "bwadminMemberSOfAnOrganization1",
                name.charAt(0).toUpperCase() + name.slice(1),
              ),
        )
        .option("--orgid <orgid>", this.serviceContainer.i18nService.t("bwadminOrganizationId"))
        .option(
          "--email <email>",
          this.serviceContainer.i18nService.t("bwadminCommaSeparatedEmailsInviteOnly"),
        )
        .option(
          "--role <role>",
          this.serviceContainer.i18nService.t("bwadminOwnerAdminUserCustomInviteOnlyDefaultUser"),
        )
        .action(async (ids: string[], options: OptionValues) => {
          await this.exitIfNotAuthed();
          const command = new MemberWriteCommand(
            this.serviceContainer.apiService,
            this.serviceContainer.keyService,
            this.serviceContainer.encryptService,
            this.serviceContainer.organizationUserApiService,
            this.serviceContainer.accountService,
            this.serviceContainer.i18nService,
          );
          let response: Response;
          if (options.orgid == null || options.orgid === "") {
            response = Response.badRequest(
              this.serviceContainer.i18nService.t("bwadminOrgidOptionIsRequired"),
            );
          } else if (!Utils.isGuid(options.orgid)) {
            response = Response.badRequest(
              this.serviceContainer.i18nService.t("bwadminIsNotAGuid1", options.orgid),
            );
          } else if (name === "invite") {
            response = await command.invite(options.orgid, options.email, options.role);
          } else {
            const parsed = this.parseIds(ids ?? []);
            const run = (
              command[name as keyof MemberWriteCommand] as (
                organizationId: string,
                ids: string[],
              ) => Promise<Response>
            ).bind(command);
            response =
              parsed.length === 0
                ? Response.badRequest(
                    this.serviceContainer.i18nService.t("bwadminIdsMustContainAtLeastOneMemberId"),
                  )
                : await run(options.orgid, parsed);
          }
          this.processMemberWriteResponse(response);
        });
    }

    const accessOptions = (cmd: Command) =>
      cmd
        .option("--readonly", this.serviceContainer.i18nService.t("bwadminReadOnlyAccess"))
        .option("--hidepasswords", this.serviceContainer.i18nService.t("bwadminHidePasswords"))
        .option("--manage", this.serviceContainer.i18nService.t("bwadminCanManageTheCollection"))
        .option(
          "--remove",
          this.serviceContainer.i18nService.t("bwadminRevokeAccessInsteadOfAssigningIt"),
        );

    const collectionCmd = this.cli
      .command("collection")
      .description(this.serviceContainer.i18nService.t("bwadminManageOrganizationCollections"));

    collectionCmd
      .command("create <name>")
      .description(this.serviceContainer.i18nService.t("bwadminCreateAnOrganizationCollection"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .action(async (name: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const collection = new CollectionAdminView({
          id: null,
          organizationId: options.orgid,
          name,
        } as any);
        await this.getCollectionAdminService().create(collection, await this.activeUserId());
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminCreatedCollection1", name),
              null,
            ),
          ),
        );
      });

    collectionCmd
      .command("edit <collectionid>")
      .description(this.serviceContainer.i18nService.t("bwadminRenameAnOrganizationCollection"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption(
        "--name <name>",
        this.serviceContainer.i18nService.t("bwadminNewCollectionName"),
      )
      .action(async (collectionId: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const collection = await this.getCollection(options.orgid, collectionId);
        if (collection == null) {
          return;
        }
        collection.name = options.name;
        await this.getCollectionAdminService().update(collection, await this.activeUserId());
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminUpdatedCollection") + options.name + ".",
              null,
            ),
          ),
        );
      });

    collectionCmd
      .command("details <collectionid>")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminShowCollectionDetailsIncludingGroupAndUserAccess",
        ),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .action(async (collectionId: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const collection = await this.getCollection(options.orgid, collectionId);
        if (collection == null) {
          return;
        }
        if (process.env.BW_RAW === "true" || process.env.BW_RESPONSE === "true") {
          this.processResponse(
            Response.success({
              object: "collectionDetails",
              name: collection.name,
              groups: collection.groups,
              users: collection.users,
            } as any),
          );
          return;
        }
        writeLn(collection.name);
        const columns: TableColumn<CollectionAccessSelectionView>[] = [
          { header: this.serviceContainer.i18nService.t("bwadminId"), value: (s) => s.id },
          {
            header: this.serviceContainer.i18nService.t("bwadminReadonly"),
            value: (s) => String(s.readOnly),
          },
          {
            header: this.serviceContainer.i18nService.t("bwadminHidepasswords"),
            value: (s) => String(s.hidePasswords),
          },
          {
            header: this.serviceContainer.i18nService.t("bwadminManage"),
            value: (s) => String(s.manage),
          },
        ];
        writeLn(this.serviceContainer.i18nService.t("bwadminGroups"));
        writeTable(columns, collection.groups);
        writeLn(this.serviceContainer.i18nService.t("bwadminUsers"));
        writeTable(columns, collection.users);
        process.exitCode = 0;
      });

    const accessCommand = (name: string, description: string, idOption: string) =>
      collectionCmd
        .command(name)
        .description(description)
        .requiredOption(
          "--orgid <orgid>",
          this.serviceContainer.i18nService.t("bwadminOrganizationId"),
        )
        .requiredOption(
          idOption + " <id>",
          (idOption === "--groupid"
            ? this.serviceContainer.i18nService.t("bwadminGroup")
            : this.serviceContainer.i18nService.t("bwadminMember")) + " id.",
        )
        .action(async (collectionId: string, options: OptionValues) => {
          await this.exitIfNotAuthed();
          const collection = await this.getCollection(options.orgid, collectionId);
          if (collection == null) {
            return;
          }
          const id = options.groupid ?? options.memberid;
          const selectionKey = options.groupid != null ? "groups" : "users";
          const remaining = collection[selectionKey].filter((s) => s.id !== id);
          if (!options.remove) {
            remaining.push(
              new CollectionAccessSelectionView({
                id,
                readOnly: !!options.readonly,
                hidePasswords: !!options.hidepasswords,
                manage: !!options.manage,
              }),
            );
          }
          collection[selectionKey] = remaining;
          // shortcut: whole-collection read-modify-write loses concurrent access
          // changes; libs/ has no per-user/per-group collection-access endpoint, switch when one lands
          await this.getCollectionAdminService().update(collection, await this.activeUserId());
          this.processResponse(
            Response.success(
              new MessageResponse(
                this.serviceContainer.i18nService.t("bwadminUpdatedCollectionAccess"),
                null,
              ),
            ),
          );
        });

    accessOptions(
      accessCommand(
        "user-access <collectionid>",
        this.serviceContainer.i18nService.t("bwadminAssignOrRevokeAMemberSAccessToACollection"),
        "--memberid",
      ),
    );
    accessOptions(
      accessCommand(
        "group-access <collectionid>",
        this.serviceContainer.i18nService.t("bwadminAssignOrRevokeAGroupSAccessToACollection"),
        "--groupid",
      ),
    );

    collectionCmd
      .command("bulk-access")
      .description(
        this.serviceContainer.i18nService.t("bwadminAssignAccessToMultipleCollectionsAtOnce"),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption(
        "--collectionid <ids...>",
        this.serviceContainer.i18nService.t("bwadminCollectionIds"),
      )
      .option("--groupid <ids...>", this.serviceContainer.i18nService.t("bwadminGroupIdsToAssign"))
      .option(
        "--memberid <ids...>",
        this.serviceContainer.i18nService.t("bwadminMemberIdsToAssign"),
      )
      .option("--readonly", this.serviceContainer.i18nService.t("bwadminReadOnlyAccess"))
      .option("--hidepasswords", this.serviceContainer.i18nService.t("bwadminHidePasswords"))
      .option("--manage", this.serviceContainer.i18nService.t("bwadminCanManageTheCollection"))
      .action(async (options: OptionValues) => {
        await this.exitIfNotAuthed();
        const selection = (ids: string[]) =>
          (ids ?? []).map(
            (id) =>
              new CollectionAccessSelectionView({
                id,
                readOnly: !!options.readonly,
                hidePasswords: !!options.hidepasswords,
                manage: !!options.manage,
              }),
          );
        await this.getCollectionAdminService().bulkAssignAccess(
          options.orgid,
          options.collectionid,
          selection(options.memberid),
          selection(options.groupid),
        );
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t(
                "bwadminUpdatedAccessFor1Collections",
                options.collectionid.length,
              ),
              null,
            ),
          ),
        );
      });

    collectionCmd
      .command("delete <collectionid>")
      .description(this.serviceContainer.i18nService.t("bwadminDeleteAnOrganizationCollection"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .action(async (collectionId: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        await this.getCollectionAdminService().delete(options.orgid, collectionId);
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t("bwadminDeletedCollection"),
              null,
            ),
          ),
        );
      });

    collectionCmd
      .command("bulk-delete")
      .description(
        this.serviceContainer.i18nService.t("bwadminDeleteMultipleOrganizationCollections"),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption(
        "--collectionid <ids...>",
        this.serviceContainer.i18nService.t("bwadminCollectionIds"),
      )
      .action(async (options: OptionValues) => {
        await this.exitIfNotAuthed();
        await this.serviceContainer.apiService.deleteManyCollections(
          options.orgid,
          options.collectionid,
        );
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t(
                "bwadminDeleted1Collections",
                options.collectionid.length,
              ),
              null,
            ),
          ),
        );
      });

    this.cli
      .command("create group")
      .description(this.serviceContainer.i18nService.t("bwadminCreateAnOrganizationGroup"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption("--name <name>", this.serviceContainer.i18nService.t("bwadminGroupName"))
      .option(
        "--externalid <externalid>",
        this.serviceContainer.i18nService.t("bwadminExternalGroupId"),
      )
      .action(async (_object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const command = new GroupCommand(this.serviceContainer);
        const response = await command.create(options.orgid, options.name, options.externalid);
        this.processResponse(response);
      });

    this.cli
      .command("edit group")
      .description(this.serviceContainer.i18nService.t("bwadminRenameAnOrganizationGroup"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption("--groupid <groupid>", this.serviceContainer.i18nService.t("bwadminGroupId"))
      .requiredOption("--name <name>", this.serviceContainer.i18nService.t("bwadminNewGroupName"))
      .action(async (_object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const command = new GroupCommand(this.serviceContainer);
        const response = await command.edit(options.orgid, options.groupid, options.name);
        this.processResponse(response);
      });

    this.cli
      .command("delete group")
      .description(this.serviceContainer.i18nService.t("bwadminDeleteOneOrMoreOrganizationGroups"))
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption(
        "--groupid <groupid...>",
        this.serviceContainer.i18nService.t("bwadminGroupIdS"),
      )
      .action(async (_object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const command = new GroupCommand(this.serviceContainer);
        const response = await command.delete(options.orgid, options.groupid);
        this.processResponse(response);
      });

    this.cli
      .command("group members")
      .description(
        this.serviceContainer.i18nService.t("bwadminViewOrSetTheMembersOfAnOrganizationGroup"),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .requiredOption("--groupid <groupid>", this.serviceContainer.i18nService.t("bwadminGroupId"))
      .option(
        "--userid <userid...>",
        this.serviceContainer.i18nService.t(
          "bwadminOrganizationUserIdSToAssignOmitToViewCurrentMembers",
        ),
      )
      .action(async (_object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const command = new GroupCommand(this.serviceContainer);
        const response = await command.members(options.orgid, options.groupid, options.userid);
        if (options.userid != null) {
          this.processResponse(response);
          return;
        }
        this.processListResponse(response, [
          { header: this.serviceContainer.i18nService.t("emailTitle"), value: (m: any) => m.email },
          { header: this.serviceContainer.i18nService.t("bwadminId"), value: (m: any) => m.id },
        ]);
      });

    this.cli
      .command("get <object>")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminGetOrganizationDetailsOrgSettingsOrgPublicKeyOrgApiKeyInfo",
        ),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .option(
        "--type <type>",
        this.serviceContainer.i18nService.t(
          "bwadminApiKeyTypeFilterOrgApiKeyInfoOnly0Default1Billingsync2Scim",
        ),
      )
      .action(async (object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const api = this.serviceContainer.organizationApiService;
        switch (object.toLowerCase()) {
          case "org-settings": {
            const org = await api.get(options.orgid);
            this.processObjectResponse(
              Response.success(org as any),
              this.settingsRows(org, ["id", "name", "businessName", "billingEmail", "seats"]),
            );
            break;
          }
          case "org-public-key": {
            const keys = await api.getKeys(options.orgid);
            this.processObjectResponse(Response.success(new StringResponse(keys.publicKey)), [
              ["publicKey", keys.publicKey],
            ]);
            break;
          }
          case "org-api-key-info": {
            const type = options.type != null ? parseInt(options.type, 10) : undefined;
            const info = await api.getApiKeyInformation(options.orgid, type);
            this.processObjectResponse(
              Response.success(info as any),
              info.data.map((k: any) => ["keyType", enumName(OrganizationApiKeyType, k.keyType)]),
            );
            break;
          }
          default:
            this.processResponse(
              Response.badRequest(
                this.serviceContainer.i18nService.t("bwadminUnknownGetObject") + object + ".",
              ),
            );
            return;
        }
      });

    this.cli
      .command("update <object>")
      .description(
        this.serviceContainer.i18nService.t("bwadminUpdateOrganizationSettingsOrgSettings"),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .option("--name <name>", this.serviceContainer.i18nService.t("bwadminNewOrganizationName"))
      .option(
        "--billing-email <billingEmail>",
        this.serviceContainer.i18nService.t("bwadminNewBillingEmail"),
      )
      .action(async (object: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        if (object.toLowerCase() !== "org-settings") {
          this.processResponse(
            Response.badRequest(
              this.serviceContainer.i18nService.t("bwadminUnknownUpdateObject") + object + ".",
            ),
          );
          return;
        }
        if (options.name == null && options.billingEmail == null) {
          this.processResponse(
            Response.badRequest(
              this.serviceContainer.i18nService.t(
                "bwadminNothingToUpdateProvideNameAndOrBillingEmail",
              ),
            ),
          );
          return;
        }
        const api = this.serviceContainer.organizationApiService;
        const org = await api.get(options.orgid);
        // Spread the fetched organization so unprovided fields are sent back
        // unchanged instead of undefined, which would clobber server-side settings.
        const request: OrganizationUpdateRequest = {
          ...org,
          name: options.name ?? org.name,
          billingEmail: options.billingEmail ?? org.billingEmail,
        };
        const updated = await api.save(options.orgid, request);
        this.processObjectResponse(
          Response.success(updated as any),
          this.settingsRows(updated, ["name", "billingEmail"]),
        );
      });

    this.cli
      .command("policy <type>")
      .description(
        this.serviceContainer.i18nService.t("bwadminShowOrUpdateASingleOrganizationPolicy"),
      )
      .requiredOption(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationId"),
      )
      .option("--enable", this.serviceContainer.i18nService.t("bwadminEnableThePolicy"))
      .option("--disable", this.serviceContainer.i18nService.t("bwadminDisableThePolicy"))
      .option(
        "--data <data>",
        this.serviceContainer.i18nService.t(
          "bwadminPolicyConfigurationJsonMergedOverTheExistingData",
        ),
      )
      .action(async (type: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        if (!/^\d+$/.test(type)) {
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t("bwadminTypeMustBeANumericPolicyType"),
            ),
          );
          return;
        }
        if (options.enable === true && options.disable === true) {
          this.processResponse(
            Response.badRequest(
              this.serviceContainer.i18nService.t("bwadminEnableAndDisableAreMutuallyExclusive"),
            ),
          );
          return;
        }
        const policyType = Object.values(PolicyType).find(
          (value): value is PolicyType => typeof value === "number" && value === Number(type),
        );
        if (policyType == null) {
          this.processResponse(
            Response.badRequest(this.serviceContainer.i18nService.t("bwadminUnknownPolicyType")),
          );
          return;
        }
        const current = await this.serviceContainer.policyApiService.getPolicy(
          options.orgid,
          policyType,
        );

        const updating =
          options.enable === true || options.disable === true || options.data != null;
        if (!updating) {
          this.processObjectResponse(
            Response.success({
              object: "policy",
              organizationId: current.organizationId,
              type: current.type,
              enabled: current.enabled,
              data: current.data,
            } as any),
            [
              ["type", enumName(PolicyType, current.type)],
              ["enabled", String(current.enabled)],
              ["data", JSON.stringify(current.data ?? {})],
            ],
          );
          return;
        }

        let data = current.data ?? {};
        if (options.data != null) {
          try {
            data = { ...data, ...JSON.parse(options.data) };
          } catch {
            this.processResponse(
              Response.error(this.serviceContainer.i18nService.t("bwadminInvalidJsonInDataOption")),
            );
            return;
          }
        }
        const enabled =
          options.enable === true ? true : options.disable === true ? false : current.enabled;
        await this.serviceContainer.policyApiService.putPolicy(options.orgid, policyType, {
          policy: { enabled, data },
          metadata: null,
        });
        this.processResponse(
          Response.success(
            new MessageResponse(
              this.serviceContainer.i18nService.t(
                options.enable === true
                  ? "bwadminEnabledPolicy1"
                  : options.disable === true
                    ? "bwadminDisabledPolicy1"
                    : "bwadminUpdatedPolicy1",
                enumName(PolicyType, policyType),
              ),
              null,
            ),
          ),
        );
      });

    registerTwoFactorCommands(this.cli, this.serviceContainer, (r) => this.processResponse(r));

    this.cli
      .command("events <object> <id>")
      .description(
        this.serviceContainer.i18nService.t(
          "bwadminListEventLogsForAnOrganizationOrgAnOrganizationMemberMemberOrACipherCipher",
        ),
      )
      .option(
        "--orgid <orgid>",
        this.serviceContainer.i18nService.t("bwadminOrganizationIdRequiredForMember"),
      )
      .option("--start <start>", this.serviceContainer.i18nService.t("bwadminStartDateEG20261101"))
      .option("--end <end>", this.serviceContainer.i18nService.t("bwadminEndDateEG20261130"))
      .option(
        "--token <token>",
        this.serviceContainer.i18nService.t("bwadminContinuationTokenForTheNextPage"),
      )
      .action(async (object: string, id: string, options: OptionValues) => {
        await this.exitIfNotAuthed();
        const scope = object.toLowerCase();
        const { orgid, start, end, token } = options;
        let list: EventListResponse<EventResponse>;
        if (scope === "org") {
          list = await this.serviceContainer.apiService.getEventsOrganization(
            id,
            start,
            end,
            token,
          );
        } else if (scope === "member") {
          if (orgid == null) {
            this.processResponse(
              Response.error(this.serviceContainer.i18nService.t("bwadminOrgidOptionIsRequired")),
            );
            return;
          }
          list = await this.serviceContainer.apiService.getEventsOrganizationUser(
            orgid,
            id,
            start,
            end,
            token,
          );
        } else if (scope === "cipher") {
          list = await this.serviceContainer.apiService.getEventsCipher(id, start, end, token);
        } else {
          this.processResponse(
            Response.error(
              this.serviceContainer.i18nService.t("bwadminUnknownEventsObject1", object),
            ),
          );
          return;
        }
        this.processEventsResponse(list);
      });
  }

  private settingsRows(org: any, fields: string[]): [string, string][] {
    return fields.map((f) => [f, String(org[f] ?? "")]);
  }

  /** Key/value table by default; JSON via the standard --raw/--response handling. */
  protected processObjectResponse(response: Response, rows: [string, string][]) {
    if (process.env.BW_RAW === "true" || process.env.BW_RESPONSE === "true") {
      this.processResponse(response);
      return;
    }
    if (!response.success) {
      this.processResponse(response);
      return;
    }
    writeTable(
      [
        {
          header: this.serviceContainer.i18nService.t("bwadminSetting"),
          value: (r: [string, string]) => r[0],
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminValue"),
          value: (r: [string, string]) => r[1],
        },
      ],
      rows,
    );
    process.exitCode = 0;
  }

  private async listPolicies(orgid: string) {
    if (orgid == null) {
      this.processResponse(
        Response.error(
          this.serviceContainer.i18nService.t("bwadminOrganizationidOptionIsRequired"),
        ),
      );
      return;
    }
    const list = await this.serviceContainer.policyApiService.getPolicies(orgid);
    const response = Response.success(
      new ListResponse(
        list.data.map((p: any) => ({
          object: "policy",
          id: p.id,
          type: p.type,
          enabled: p.enabled,
          data: p.data,
        })),
      ),
    );
    this.processListResponse(response, [
      {
        header: this.serviceContainer.i18nService.t("bwadminType"),
        value: (p: any) => enumName(PolicyType, p.type),
      },
      {
        header: this.serviceContainer.i18nService.t("bwadminEnabled"),
        value: (p: any) => String(p.enabled),
      },
      {
        header: this.serviceContainer.i18nService.t("bwadminData"),
        value: (p: any) => (p.data == null ? "" : JSON.stringify(p.data)),
      },
    ]);
  }

  private async activeUserId() {
    return await firstValueFrom(getUserId(this.serviceContainer.accountService.activeAccount$));
  }

  private async getCollection(organizationId: string, collectionId: string) {
    const views = await firstValueFrom(
      this.getCollectionAdminService().collectionAdminViews$(
        organizationId,
        await this.activeUserId(),
      ),
    );
    const collection = views.find((c) => c.id === collectionId);
    if (collection == null) {
      this.processResponse(
        Response.error(this.serviceContainer.i18nService.t("bwadminCollectionNotFound")),
      );
      return null;
    }
    return collection;
  }

  /** Table output by default; JSON via the standard --raw/--response handling. */
  private processEventsResponse(list: EventListResponse<EventResponse>) {
    if (process.env.BW_RAW === "true" || process.env.BW_RESPONSE === "true") {
      this.processResponse(Response.success(list as any));
      return;
    }
    writeTable(
      [
        {
          header: this.serviceContainer.i18nService.t("bwadminType"),
          value: (e: EventResponse) => enumName(EventType, e.type),
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminDate"),
          value: (e: EventResponse) => e.date ?? "",
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminActinguser"),
          value: (e: EventResponse) => e.actingUserId ?? "",
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminIp"),
          value: (e: EventResponse) => e.ipAddress ?? "",
        },
      ],
      list.data,
    );
    if (list.continuationToken != null) {
      writeLn(
        this.serviceContainer.i18nService.t("bwadminContinuationToken1", list.continuationToken),
      );
    }
    process.exitCode = 0;
  }

  private parseIds(ids: string[]): string[] {
    return ids.filter((id) => {
      if (!Utils.isGuid(id)) {
        writeLn(chalk.redBright(`\`${id}\` is not a GUID.`), false, true);
        return false;
      }
      return true;
    });
  }

  /** Bulk member ops carry per-item results; print them as a table (JSON via --raw/--response). */
  private processMemberWriteResponse(response: Response) {
    const list = response.data as ListResponse;
    if (process.env.BW_RAW === "true" || process.env.BW_RESPONSE === "true" || !list) {
      this.processResponse(response);
      if (!response.success) {
        return;
      }
      return;
    }
    const rows = list.data as unknown as MemberWriteResult[];
    writeTable(
      [
        {
          header: this.serviceContainer.i18nService.t("bwadminResult"),
          value: (r: MemberWriteResult) =>
            r.error
              ? this.serviceContainer.i18nService.t("bwadminFailed")
              : this.serviceContainer.i18nService.t("bwadminOk"),
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminId"),
          value: (r: MemberWriteResult) => r.id,
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminError"),
          value: (r: MemberWriteResult) => r.error ?? "",
        },
      ],
      rows,
    );
    process.exitCode = rows.some((r) => r.error) ? 1 : 0;
  }

  private listColumns(object: string): TableColumn<any>[] {
    if (object.toLowerCase() === "groups") {
      return [
        { header: this.serviceContainer.i18nService.t("bwadminName"), value: (g: any) => g.name },
        {
          header: this.serviceContainer.i18nService.t("bwadminExternalid"),
          value: (g: any) => g.externalId ?? "",
        },
        { header: this.serviceContainer.i18nService.t("bwadminId"), value: (g: any) => g.id },
      ];
    }
    if (object.toLowerCase().startsWith("collection")) {
      return [
        { header: this.serviceContainer.i18nService.t("bwadminName"), value: (c: any) => c.name },
        { header: this.serviceContainer.i18nService.t("bwadminId"), value: (c: any) => c.id },
      ];
    }
    if (object.toLowerCase().startsWith("member")) {
      return [
        { header: this.serviceContainer.i18nService.t("emailTitle"), value: (m: any) => m.email },
        {
          header: this.serviceContainer.i18nService.t("bwadminStatus"),
          value: (m: any) => enumName(OrganizationUserStatusType, m.status),
        },
        {
          header: this.serviceContainer.i18nService.t("bwadminRole"),
          value: (m: any) => enumName(OrganizationUserType, m.type),
        },
        { header: this.serviceContainer.i18nService.t("bwadminId"), value: (m: any) => m.id },
      ];
    }
    return [
      { header: this.serviceContainer.i18nService.t("bwadminName"), value: (o: any) => o.name },
      { header: this.serviceContainer.i18nService.t("bwadminId"), value: (o: any) => o.id },
      {
        header: this.serviceContainer.i18nService.t("bwadminEnabled"),
        value: (o: any) => String(o.enabled),
      },
    ];
  }

  /** Table output by default; JSON via the standard --raw/--response handling. */
  protected processListResponse(response: Response, columns: TableColumn<any>[]) {
    if (process.env.BW_RAW === "true" || process.env.BW_RESPONSE === "true") {
      this.processResponse(response);
      return;
    }
    if (!response.success) {
      this.processResponse(response);
      return;
    }
    const list = response.data as ListResponse;
    writeTable(columns, list.data);
    process.exitCode = 0;
  }
}
