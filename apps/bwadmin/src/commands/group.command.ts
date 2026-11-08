import { Response } from "@bitwarden/cli/models/response";
import { ListResponse } from "@bitwarden/cli/models/response/list.response";
import { StringResponse } from "@bitwarden/cli/models/response/string.response";
import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";

interface GroupRecord {
  object: "group";
  id: string;
  name: string;
  externalId: string;
}

interface GroupMemberRecord {
  object: "groupMember";
  id: string;
  email: string;
}

interface GroupDetailsResponse {
  id: string;
  name: string;
  collections: any[];
}

/**
 * Group CRUD and membership against the organizations API, mirroring the
 * endpoints of apps/web GroupApiService (plain data, no encryption involved).
 */
export class GroupCommand {
  constructor(private serviceContainer: ServiceContainer) {}

  async list(orgId: string): Promise<Response> {
    const r = await this.serviceContainer.apiService.send(
      "GET",
      "/organizations/" + orgId + "/groups",
      null,
      true,
      true,
    );
    const groups: GroupRecord[] = r.data.map((g: any) => ({
      object: "group",
      id: g.id ?? g.Id,
      name: g.name ?? g.Name,
      externalId: g.externalId ?? g.ExternalId ?? null,
    }));
    return Response.success(new ListResponse(groups));
  }

  async create(orgId: string, name: string, externalId?: string): Promise<Response> {
    const r = await this.serviceContainer.apiService.send(
      "POST",
      "/organizations/" + orgId + "/groups",
      { name, externalId, collections: [], users: [] },
      true,
      true,
    );
    return Response.success(new StringResponse(r.id ?? r.Id));
  }

  async edit(orgId: string, groupId: string, name: string): Promise<Response> {
    const details = await this.getDetails(orgId, groupId);
    const users = await this.serviceContainer.apiService.getGroupUsers(orgId, groupId);
    await this.putGroup(orgId, groupId, name, details.collections, users);
    return Response.success(null);
  }

  async delete(orgId: string, groupIds: string[]): Promise<Response> {
    if (groupIds.length === 1) {
      await this.serviceContainer.apiService.send(
        "DELETE",
        "/organizations/" + orgId + "/groups/" + groupIds[0],
        null,
        true,
        false,
      );
    } else {
      await this.serviceContainer.apiService.send(
        "DELETE",
        "/organizations/" + orgId + "/groups",
        { ids: groupIds },
        true,
        true,
      );
    }
    return Response.success(null);
  }

  async members(orgId: string, groupId: string, userIds?: string[]): Promise<Response> {
    if (userIds == null) {
      const userIdsInGroup = await this.serviceContainer.apiService.getGroupUsers(orgId, groupId);
      const roster = await this.serviceContainer.organizationUserApiService.getAllUsers(orgId);
      const emails = new Map<string, string>((roster.data as any[]).map((u) => [u.id, u.email]));
      const members: GroupMemberRecord[] = userIdsInGroup.map((id) => ({
        object: "groupMember",
        id,
        email: emails.get(id) ?? "",
      }));
      return Response.success(new ListResponse(members));
    }

    const details = await this.getDetails(orgId, groupId);
    await this.putGroup(orgId, groupId, details.name, details.collections, userIds);
    return Response.success(null);
  }

  private async getDetails(orgId: string, groupId: string): Promise<GroupDetailsResponse> {
    const r = await this.serviceContainer.apiService.send(
      "GET",
      "/organizations/" + orgId + "/groups/" + groupId + "/details",
      null,
      true,
      true,
    );
    return {
      id: r.id ?? r.Id,
      name: r.name ?? r.Name,
      collections: r.collections ?? r.Collections ?? [],
    };
  }

  private async putGroup(
    orgId: string,
    groupId: string,
    name: string,
    collections: any[],
    users: string[],
  ): Promise<void> {
    await this.serviceContainer.apiService.send(
      "PUT",
      "/organizations/" + orgId + "/groups/" + groupId,
      { name, collections, users },
      true,
      true,
    );
  }
}
