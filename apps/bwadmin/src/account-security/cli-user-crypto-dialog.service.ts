import inquirer from "inquirer";

import { CliUtils } from "@bitwarden/cli/utils";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { PublicKey } from "@bitwarden/sdk-internal";
import { UserCryptoDialogService } from "@bitwarden/user-crypto-management";

const writeLn = CliUtils.writeLn;

/**
 * CLI trust dialog for user key rotation: lists untrusted organization and
 * emergency access memberships and requires explicit confirmation before the
 * rotation proceeds. Denies trust (aborts the rotation) in non-interactive
 * mode or when the user declines.
 */
export class CliUserCryptoDialogService extends UserCryptoDialogService {
  constructor(private i18nService: I18nService) {
    super();
  }
  async verifyTrust(
    organizationV1Memberships: { name?: string }[],
    emergencyAccessV1Memberships: { name?: string }[],
  ) {
    const memberships = [
      ...organizationV1Memberships.map((m) =>
        this.i18nService.t("bwadminOrganization1", m.name ?? "unnamed"),
      ),
      ...emergencyAccessV1Memberships.map((m) =>
        this.i18nService.t("bwadminEmergencyAccess1", m.name ?? "unnamed"),
      ),
    ];

    if (memberships.length > 0) {
      writeLn(
        "The following memberships could not be trusted automatically. Verify their " +
          "fingerprints (in the web vault or with the grantees) before continuing:",
        true,
        false,
      );
      for (const membership of memberships) {
        writeLn(`  - ${membership}`, true, false);
      }

      let confirmed = false;
      if (process.env.BW_NOINTERACTION !== "true") {
        const answer: inquirer.Answers = await inquirer.createPromptModule({
          output: process.stderr,
        })({
          type: "confirm",
          name: "trusted",
          message: this.i18nService.t("bwadminTrustTheseMembershipsAndContinueTheKeyRotation"),
          default: false,
        });
        confirmed = answer.trusted === true;
      }

      if (!confirmed) {
        return {
          wasTrustDenied: true,
          trustedOrganizationPublicKeys: [] as PublicKey[],
          trustedEmergencyAccessUserPublicKeys: [] as PublicKey[],
        };
      }
    }

    return {
      wasTrustDenied: false,
      trustedOrganizationPublicKeys: [] as PublicKey[],
      trustedEmergencyAccessUserPublicKeys: [] as PublicKey[],
    };
  }
}
