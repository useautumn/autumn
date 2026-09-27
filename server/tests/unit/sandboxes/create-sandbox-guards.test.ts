import { beforeEach, describe, expect, test } from "bun:test";
import { ErrCode, type Organization } from "@autumn/shared";

const state = {
	existing: [] as unknown[],
	provisionCalled: false,
	teardownCalled: false,
	listSandboxesCalls: 0,
};

// Spread the real module so every export stays defined — a partial factory
// poisons later files in the same process with missing-export link errors.
const realInitDrizzle = await import("@/db/initDrizzle.js");
await mockModuleWithRestore("@/db/initDrizzle.js", () => ({
	...realInitDrizzle,
	db: {},
	initDrizzle: () => ({ db: {} }),
}));
await mockModuleWithRestore("@/external/logtail/logtailUtils.js", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
await mockModuleWithRestore("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		listSandboxes: async () => {
			state.listSandboxesCalls++;
			return state.existing;
		},
	},
}));
await mockModuleWithRestore(
	"@/internal/orgs/orgUtils/provisionSubOrg.js",
	() => ({
		provisionSubOrg: async ({ slug, name }: { slug: string; name: string }) => {
			state.provisionCalled = true;
			return { id: "org_sandbox", slug, name };
		},
	}),
);
await mockModuleWithRestore("@/internal/dev/apiKeys/apiKeyUtils.js", () => ({
	createKey: async () => "am_sk_test_generated",
}));
await mockModuleWithRestore(
	"@/internal/orgs/deleteOrg/deletePlatformSubOrg.js",
	() => ({
		deletePlatformSubOrg: async () => {
			state.teardownCalled = true;
		},
	}),
);

import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const masterOrg = { id: "org_master" } as unknown as Organization;
const actorUser = { id: "u1", email: "a@b.c" } as never;
const db = {} as never;

const seedSandboxes = (n: number) => {
	state.existing = Array.from({ length: n }, (_, i) => ({
		id: `s${i}`,
		name: `Seed Sandbox ${i}`,
	}));
};

beforeEach(() => {
	state.existing = [];
	state.provisionCalled = false;
	state.teardownCalled = false;
	state.listSandboxesCalls = 0;
});

describe("createSandboxForOrg guards names before provisioning", () => {
	test("provisions a valid name", async () => {
		seedSandboxes(1);
		const res = await createSandboxForOrg({
			db,
			masterOrg,
			actorUser,
			name: "My-Sandbox",
		});
		expect(state.provisionCalled).toBe(true);
		expect(res.secret_key).toBe("am_sk_test_generated");
		expect(res.org.id).toBe("org_sandbox");
	});

	test("rejects a duplicate name and never provisions", async () => {
		state.existing = [{ id: "s0", name: "My-Sandbox" }];
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "My-Sandbox" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("rejects a reserved-slug name and never provisions", async () => {
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "Products" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("rejects a name that slugifies to empty and never provisions", async () => {
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "🚀🎉" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("fetches the sandbox list once per create", async () => {
		seedSandboxes(1);
		await createSandboxForOrg({ db, masterOrg, actorUser, name: "My-Sandbox" });
		expect(state.listSandboxesCalls).toBe(1);
	});
});
