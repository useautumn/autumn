import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ErrCode, type Organization } from "@autumn/shared";

const state = {
	existing: [] as unknown[],
	autumn: { allowed: true } as { allowed?: boolean },
	autumnThrows: false,
	autumnCalled: false,
	autumnArgs: null as null | Record<string, unknown>,
	provisionCalled: false,
	teardownCalled: false,
	listSandboxesCalls: 0,
};

mock.module("@/db/initDrizzle.js", () => ({
	db: {},
	initDrizzle: () => ({ db: {} }),
}));
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module("autumn-js", () => ({
	Autumn: class {
		async check(args: Record<string, unknown>) {
			state.autumnCalled = true;
			state.autumnArgs = args;
			if (state.autumnThrows) {
				throw new Error("autumn unreachable");
			}
			return state.autumn;
		}
	},
}));
mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		listSandboxes: async () => {
			state.listSandboxesCalls++;
			return state.existing;
		},
	},
}));
mock.module("@/internal/orgs/orgUtils/provisionSubOrg.js", () => ({
	provisionSubOrg: async ({ slug, name }: { slug: string; name: string }) => {
		state.provisionCalled = true;
		return { id: "org_sandbox", slug, name };
	},
}));
mock.module("@/internal/dev/api-keys/apiKeyUtils.js", () => ({
	createKey: async () => "am_sk_test_generated",
}));
mock.module("@/internal/orgs/deleteOrg/deletePlatformSubOrg.js", () => ({
	deletePlatformSubOrg: async () => {
		state.teardownCalled = true;
	},
}));

import {
	assertSandboxCapacity,
	createSandboxForOrg,
} from "@/internal/sandboxes/createSandbox.js";

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
	state.autumn = { allowed: true };
	state.autumnThrows = false;
	state.autumnCalled = false;
	state.autumnArgs = null;
	state.provisionCalled = false;
	state.teardownCalled = false;
	state.listSandboxesCalls = 0;
	process.env.AUTUMN_SECRET_KEY = "test_key";
});

describe("assertSandboxCapacity (max_sandboxes entitlement gate)", () => {
	test("rejects with feature_limit_reached when the injected check denies", async () => {
		seedSandboxes(2);
		const promise = assertSandboxCapacity({
			db,
			masterOrgId: masterOrg.id,
			checkCapacity: async () => ({ allowed: false }),
		});
		await expect(promise).rejects.toMatchObject({
			code: ErrCode.FeatureLimitReached,
		});
	});

	test("checks requiredBalance = count + 1 against the master org as customer", async () => {
		seedSandboxes(2);
		let seen: { customerId: string; requiredBalance: number } | undefined;
		await assertSandboxCapacity({
			db,
			masterOrgId: masterOrg.id,
			checkCapacity: async (args) => {
				seen = args;
				return { allowed: true };
			},
		});
		expect(seen).toEqual({ customerId: "org_master", requiredBalance: 3 });
	});

	test("fails open when AUTUMN_SECRET_KEY is unset (no Autumn call)", async () => {
		process.env.AUTUMN_SECRET_KEY = "";
		seedSandboxes(99);
		state.autumn = { allowed: false };
		await assertSandboxCapacity({ db, masterOrgId: masterOrg.id });
		expect(state.autumnCalled).toBe(false);
	});

	test("fails open when the Autumn check throws", async () => {
		seedSandboxes(99);
		state.autumnThrows = true;
		await assertSandboxCapacity({ db, masterOrgId: masterOrg.id });
		expect(state.autumnCalled).toBe(true);
	});

	test("denies via the default Autumn check when it returns allowed:false", async () => {
		seedSandboxes(2);
		state.autumn = { allowed: false };
		await expect(
			assertSandboxCapacity({ db, masterOrgId: masterOrg.id }),
		).rejects.toMatchObject({ code: ErrCode.FeatureLimitReached });
		expect(state.autumnArgs).toMatchObject({
			featureId: "max_sandboxes",
			requiredBalance: 3,
		});
	});
});

describe("createSandboxForOrg enforces the cap before provisioning", () => {
	test("rejects over-cap creation and never provisions", async () => {
		seedSandboxes(2);
		state.autumn = { allowed: false };
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "My Sandbox" }),
		).rejects.toMatchObject({ code: ErrCode.FeatureLimitReached });
		expect(state.provisionCalled).toBe(false);
	});

	test("provisions when under cap", async () => {
		seedSandboxes(1);
		state.autumn = { allowed: true };
		const res = await createSandboxForOrg({
			db,
			masterOrg,
			actorUser,
			name: "My Sandbox",
		});
		expect(state.provisionCalled).toBe(true);
		expect(res.secret_key).toBe("am_sk_test_generated");
		expect(res.org.id).toBe("org_sandbox");
	});

	test("rejects a duplicate name and never provisions", async () => {
		state.autumn = { allowed: true };
		state.existing = [{ id: "s0", name: "My Sandbox" }];
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "My Sandbox" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("rejects a reserved-slug name and never provisions", async () => {
		state.autumn = { allowed: true };
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "Products" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("rejects a name that slugifies to empty and never provisions", async () => {
		state.autumn = { allowed: true };
		await expect(
			createSandboxForOrg({ db, masterOrg, actorUser, name: "🚀🎉" }),
		).rejects.toMatchObject({ code: ErrCode.InvalidRequest });
		expect(state.provisionCalled).toBe(false);
	});

	test("fetches the sandbox list once per create", async () => {
		seedSandboxes(1);
		state.autumn = { allowed: true };
		await createSandboxForOrg({ db, masterOrg, actorUser, name: "My Sandbox" });
		expect(state.listSandboxesCalls).toBe(1);
	});
});
