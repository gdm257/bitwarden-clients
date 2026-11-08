import { firstValueFrom } from "rxjs";

import {
  DefaultOrganizationUserService,
  OrganizationUserApiService,
  OrganizationUserBulkRequest,
  OrganizationUserBulkResponse,
  OrganizationUserInviteRequest,
} from "@bitwarden/admin-console/common";
import { Response } from "@bitwarden/cli/models/response";
import { ListResponse as CliListResponse } from "@bitwarden/cli/models/response/list.response";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationUserType } from "@bitwarden/common/admin-console/enums";
import { PermissionsApi } from "@bitwarden/common/admin-console/models/api/permissions.api";
import { Organization } from "@bitwarden/common/admin-console/models/domain/organization";
import { AccountService } from "@bitwarden/common/auth/abstractions/account.service";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { KeyService } from "@bitwarden/key-management";
// eslint-disable-next-line no-restricted-imports
import { EncryptService } from "@bitwarden/legacy-crypto";

export interface MemberWriteResult {
  id: string;
  error: string | null;
}

const ROLE_TYPES: Record<string, OrganizationUserType> = {
  owner: OrganizationUserType.Owner,
  admin: OrganizationUserType.Admin,
  user: OrganizationUserType.User,
  custom: OrganizationUserType.Custom,
};

/**
 * Member lifecycle operations (invite/reinvite/remove/revoke/restore/confirm).
 * Confirm and restore delegate to the shared {@link DefaultOrganizationUserService}
 * member-confirm crypto path; no encryption happens in this file.
 */
export class MemberWriteCommand {
  private organizationUserService: DefaultOrganizationUserService;

  constructor(
    private apiService: ApiService,
    keyService: KeyService,
    encryptService: EncryptService,
    private organizationUserApiService: OrganizationUserApiService,
    private accountService: AccountService,
    private i18nService: I18nService,
  ) {
    this.organizationUserService = new DefaultOrganizationUserService(
      keyService,
      encryptService,
      organizationUserApiService,
      accountService,
      i18nService,
    );
  }

  async invite(organizationId: string, emailsCsv: string, role: string): Promise<Response> {
    const emails = emailsCsv
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e !== "");
    const type = ROLE_TYPES[(role ?? "user").toLowerCase()];
    if (type == null) {
      return Response.badRequest(this.i18nService.t("bwadminUnknownRole1", role));
    }
    try {
      await this.organizationUserApiService.postOrganizationUserInvite(
        organizationId,
        new OrganizationUserInviteRequest({
          emails,
          type,
          groups: [],
          permissions: new PermissionsApi(),
          collections: [],
          accessSecretsManager: false,
        }),
      );
      return Response.success();
    } catch (e) {
      return Response.error(e);
    }
  }

  async reinvite(organizationId: string, ids: string[]): Promise<Response> {
    try {
      if (ids.length === 1) {
        await this.apiService.send(
          "POST",
          `/organizations/${organizationId}/users/${ids[0]}/reinvite`,
          null,
          true,
          false,
        );
        return Response.success();
      }
      const r = await this.apiService.send(
        "POST",
        `/organizations/${organizationId}/users/reinvite`,
        new OrganizationUserBulkRequest(ids),
        true,
        true,
      );
      return this.bulkResponse(new ListResponse(r, OrganizationUserBulkResponse));
    } catch (e) {
      return Response.error(e);
    }
  }

  async remove(organizationId: string, ids: string[]): Promise<Response> {
    try {
      if (ids.length === 1) {
        await this.organizationUserApiService.removeOrganizationUser(organizationId, ids[0]);
        return Response.success();
      }
      return this.bulkResponse(
        await this.organizationUserApiService.deleteManyOrganizationUsers(organizationId, ids),
      );
    } catch (e) {
      return Response.error(e);
    }
  }

  async revoke(organizationId: string, ids: string[]): Promise<Response> {
    try {
      if (ids.length === 1) {
        await this.organizationUserApiService.revokeOrganizationUser(organizationId, ids[0]);
        return Response.success();
      }
      return this.bulkResponse(
        await this.organizationUserApiService.revokeManyOrganizationUsers(organizationId, ids),
      );
    } catch (e) {
      return Response.error(e);
    }
  }

  async restore(organizationId: string, ids: string[]): Promise<Response> {
    const organization = { id: organizationId } as Organization;
    try {
      if (ids.length === 1) {
        await firstValueFrom(this.organizationUserService.restoreUser(organization, ids[0]));
        return Response.success();
      }
      return this.bulkResponse(
        await firstValueFrom(this.organizationUserService.bulkRestoreUsers(organization, ids)),
      );
    } catch (e) {
      return Response.error(e);
    }
  }

  async confirm(organizationId: string, ids: string[]): Promise<Response> {
    const organization = { id: organizationId } as Organization;
    try {
      if (ids.length === 1) {
        const orgUser = await this.organizationUserApiService.getOrganizationUser(
          organizationId,
          ids[0],
        );
        const publicKeyResponse = await this.apiService.getUserPublicKey(orgUser.userId);
        await firstValueFrom(
          this.organizationUserService.confirmUser(
            organization,
            ids[0],
            Utils.fromB64ToArray(publicKeyResponse.publicKey),
          ),
        );
        return Response.success();
      }
      return await this.bulkConfirm(organization, ids);
    } catch (e) {
      return Response.error(e);
    }
  }

  // Mirrors the bulk member-confirm flow in libs/auto-confirm: fetch public
  // keys, build each confirm request via the shared crypto service, then post
  // one bulk confirm. Items without a key or with a crypto failure are
  // reported per item instead of failing the whole command.
  private async bulkConfirm(organization: Organization, ids: string[]): Promise<Response> {
    const account = await firstValueFrom(this.accountService.activeAccount$);
    const userId = account.id;
    const keyResponse = await this.organizationUserApiService.postOrganizationUsersPublicKey(
      organization.id,
      ids,
      userId,
    );
    const keysById = new Map(keyResponse.data.map((entry) => [entry.id, entry.key]));

    const results: MemberWriteResult[] = [];
    const confirmEntries: { id: string; key: string }[] = [];
    for (const id of ids) {
      const publicKeyB64 = keysById.get(id);
      if (publicKeyB64 == null) {
        results.push({ id, error: this.i18nService.t("bwadminPublicKeyNotFound") });
        continue;
      }
      try {
        const request = await firstValueFrom(
          this.organizationUserService.buildConfirmRequest(
            organization,
            Utils.fromB64ToArray(publicKeyB64),
          ),
        );
        confirmEntries.push({ id, key: request.key as string });
      } catch (e) {
        results.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    if (confirmEntries.length > 0) {
      const bulkResponse = await firstValueFrom(
        this.organizationUserService.bulkConfirmUsers(organization, confirmEntries),
      );
      results.push(...this.toResults(bulkResponse));
    }
    // Keep output ordered like the input ids.
    const byId = new Map(results.map((r) => [r.id, r]));
    const ordered = ids.map(
      (id) => byId.get(id) ?? { id, error: this.i18nService.t("bwadminUnknownError") },
    );
    return Response.success(new CliListResponse(ordered as any));
  }

  private bulkResponse(response: ListResponse<OrganizationUserBulkResponse>): Response {
    return Response.success(new CliListResponse(this.toResults(response) as any));
  }

  private toResults(response: ListResponse<OrganizationUserBulkResponse>): MemberWriteResult[] {
    return response.data.map((r) => ({ id: r.id, error: r.error || null }));
  }
}
