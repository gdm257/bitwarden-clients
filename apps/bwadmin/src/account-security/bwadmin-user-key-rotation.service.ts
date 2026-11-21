import { CliUtils } from "@bitwarden/cli/utils";
import { UserId } from "@bitwarden/common/types/guid";
import { PublicKey, UpgradeTokenAction } from "@bitwarden/sdk-internal";
import { TrustVerificationResult, UserKeyRotationService } from "@bitwarden/user-crypto-management";

const writeLn = CliUtils.writeLn;

/**
 * bwadmin key rotation for servers (e.g. Vaultwarden) that do not implement the
 * key-rotation data endpoint: any trust verification failure degrades to a
 * warning and the rotation proceeds without trusted keys, instead of failing.
 */
export class BwadminUserKeyRotationService extends UserKeyRotationService {
  async verifyTrust(
    userId: UserId,
    upgradeTokenAction: UpgradeTokenAction,
  ): Promise<TrustVerificationResult> {
    try {
      return await super.verifyTrust(userId, upgradeTokenAction);
    } catch {
      writeLn(
        "Warning: the server does not support the trust data endpoint. " +
          "Skipping organization and emergency access trust verification.",
        true,
        true,
      );
      return {
        wasTrustDenied: false,
        trustedOrganizationPublicKeys: [] as PublicKey[],
        trustedEmergencyAccessUserPublicKeys: [] as PublicKey[],
      };
    }
  }
}
