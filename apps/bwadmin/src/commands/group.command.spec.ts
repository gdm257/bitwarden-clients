import { mockDeep, MockProxy } from "jest-mock-extended";

import { ServiceContainer } from "@bitwarden/cli/service-container/service-container";

import { GroupCommand } from "./group.command";

// Avoid loading the real ServiceContainer dependency graph in tests.
jest.mock("@bitwarden/cli/service-container/service-container", () => ({
  ServiceContainer: class {},
}));

const ORG_ID = "10000000-0000-0000-0000-000000000001";
const GROUP_ID = "20000000-0000-0000-0000-000000000002";

describe("GroupCommand", () => {
  let serviceContainer: ServiceContainer & {
    [K in keyof ServiceContainer]: MockProxy<ServiceContainer[K]>;
  };
  let command: GroupCommand;

  beforeEach(() => {
    serviceContainer = mockDeep<ServiceContainer>();
    serviceContainer.apiService.send.mockResolvedValue({ data: [] } as Awaited<
      ReturnType<typeof serviceContainer.apiService.send>
    >);
    command = new GroupCommand(serviceContainer);
  });

  describe("list", () => {
    it("gets all groups for the organization", async () => {
      serviceContainer.apiService.send.mockResolvedValue({
        data: [{ id: GROUP_ID, name: "Engineering", externalId: null }],
      } as Awaited<ReturnType<typeof serviceContainer.apiService.send>>);

      const response = await command.list(ORG_ID);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "GET",
        `/organizations/${ORG_ID}/groups`,
        null,
        true,
        true,
      );
      expect(response.success).toBe(true);
      expect((response.data as any).data).toEqual([
        { object: "group", id: GROUP_ID, name: "Engineering", externalId: null },
      ]);
    });
  });

  describe("create", () => {
    it("posts the new group and returns it", async () => {
      serviceContainer.apiService.send.mockResolvedValue({
        id: GROUP_ID,
        name: "Engineering",
        externalId: "ext-1",
      } as Awaited<ReturnType<typeof serviceContainer.apiService.send>>);

      const response = await command.create(ORG_ID, "Engineering", "ext-1");

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "POST",
        `/organizations/${ORG_ID}/groups`,
        { name: "Engineering", externalId: "ext-1", collections: [], users: [] },
        true,
        true,
      );
      expect((response.data as any).data).toEqual(GROUP_ID);
    });
  });

  describe("edit", () => {
    it("renames the group preserving collections and members", async () => {
      serviceContainer.apiService.send.mockResolvedValueOnce({
        id: GROUP_ID,
        name: "Engineering",
        collections: [{ id: "c-1", readOnly: false, hidePasswords: false, manage: true }],
      });
      serviceContainer.apiService.getGroupUsers.mockResolvedValue(["u-1", "u-2"]);

      await command.edit(ORG_ID, GROUP_ID, "Platform");

      expect(serviceContainer.apiService.send).toHaveBeenNthCalledWith(
        1,
        "GET",
        `/organizations/${ORG_ID}/groups/${GROUP_ID}/details`,
        null,
        true,
        true,
      );
      expect(serviceContainer.apiService.getGroupUsers).toHaveBeenCalledWith(ORG_ID, GROUP_ID);
      expect(serviceContainer.apiService.send).toHaveBeenNthCalledWith(
        2,
        "PUT",
        `/organizations/${ORG_ID}/groups/${GROUP_ID}`,
        {
          name: "Platform",
          collections: [{ id: "c-1", readOnly: false, hidePasswords: false, manage: true }],
          users: ["u-1", "u-2"],
        },
        true,
        true,
      );
    });
  });

  describe("delete", () => {
    it("deletes a single group", async () => {
      await command.delete(ORG_ID, [GROUP_ID]);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "DELETE",
        `/organizations/${ORG_ID}/groups/${GROUP_ID}`,
        null,
        true,
        false,
      );
    });

    it("bulk deletes multiple groups", async () => {
      serviceContainer.apiService.send.mockResolvedValue({ data: [] } as Awaited<
        ReturnType<typeof serviceContainer.apiService.send>
      >);

      await command.delete(ORG_ID, [GROUP_ID, "20000000-0000-0000-0000-000000000003"]);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "DELETE",
        `/organizations/${ORG_ID}/groups`,
        { ids: [GROUP_ID, "20000000-0000-0000-0000-000000000003"] },
        true,
        true,
      );
    });
  });

  describe("members", () => {
    it("lists group members with emails resolved from the member roster", async () => {
      serviceContainer.apiService.getGroupUsers.mockResolvedValue(["u-1"]);
      serviceContainer.organizationUserApiService.getAllUsers.mockResolvedValue({
        data: [
          { id: "u-1", email: "alice@example.com" },
          { id: "u-2", email: "bob@example.com" },
        ],
      } as Awaited<ReturnType<typeof serviceContainer.organizationUserApiService.getAllUsers>>);

      const response = await command.members(ORG_ID, GROUP_ID);

      expect(serviceContainer.apiService.getGroupUsers).toHaveBeenCalledWith(ORG_ID, GROUP_ID);
      expect((response.data as any).data).toEqual([
        { object: "groupMember", id: "u-1", email: "alice@example.com" },
      ]);
    });

    it("sets the group members", async () => {
      serviceContainer.apiService.send.mockResolvedValueOnce({
        id: GROUP_ID,
        name: "Engineering",
        collections: [],
      });

      await command.members(ORG_ID, GROUP_ID, ["u-2"]);

      expect(serviceContainer.apiService.send).toHaveBeenCalledWith(
        "PUT",
        `/organizations/${ORG_ID}/groups/${GROUP_ID}`,
        { name: "Engineering", collections: [], users: ["u-2"] },
        true,
        true,
      );
    });
  });
});
