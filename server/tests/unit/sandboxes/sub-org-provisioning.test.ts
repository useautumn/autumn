import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, member, organizations } from "@autumn/shared";

// Sub-org / sandbox provisioning is non-transactional: it creates external
// resources (a Stripe Connect account, two Svix apps) before the DB writes that
// record their ids, then a sandbox key. A mid-way failure must roll everything
// back and rethrow so nothing is orphaned. One file, one leaf-dep mock set, all
// three layers (provisionOrgResources -> provisionSubOrg -> createSandboxForOrg)
// exercised through their REAL implementations.

const state = {
	createdSvixApps: [] as string[],
	deletedAccounts: [] as string[],
	deletedSvixApps: [] as string[],
	rowDeletes: [] as string[],
	getCalled: 0,
	teardownOrg: null as null | Record<string, unknown>,
	// failure injection
	createConnectThrows: false,
	failOnUpdateKey: null as string | null,
	svixSandbox: "ok" as "ok" | "undef",
	svixLive: "ok" as "ok" | "undef",
	keyThrows: false,
};

const reReadOrg = {
	id: "org_sub",
	slug: "re-read",
	test_stripe_connect: { default_account_id: "acct_test" },
	svix_config: { sandbox_app_id: "app_sandbox", live_app_id: "app_live" },
};

mock.module("@/db/initDrizzle.js", () => ({
	db: {},
	initDrizzle: () => ({ db: {} }),
}));
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: { info: () => {}, warn: () => {}, error: () => {} },
}));
mock.module("@/utils/posthog.js", () => ({ captureOrgEvent: async () => {} }));
mock.module("@/internal/orgs/orgUtils/createConnectAccount.js", () => ({
	createConnectAccount: async () => {
		if (state.createConnectThrows) {
			throw new Error("stripe accounts.create failed");
		}
		return { id: "acct_test" };
	},
}));
mock.module("@/external/svix/svixHelpers.js", () => ({
	createSvixApp: async ({ env }: { env: AppEnv }) => {
		const which = env === AppEnv.Live ? state.svixLive : state.svixSandbox;
		if (which === "undef") {
			return undefined;
		}
		const id = env === AppEnv.Live ? "app_live" : "app_sandbox";
		state.createdSvixApps.push(id);
		return { id };
	},
	deleteSvixApp: async ({ appId }: { appId: string }) => {
		state.deletedSvixApps.push(appId);
	},
}));
mock.module("@/external/connect/connectUtils.js", () => ({
	deleteConnectedAccount: async ({ accountId }: { accountId: string }) => {
		state.deletedAccounts.push(accountId);
	},
	deauthorizeAccount: async () => {},
}));
mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		update: async ({ updates }: { updates: Record<string, unknown> }) => {
			if (state.failOnUpdateKey && state.failOnUpdateKey in updates) {
				throw new Error(`db write failed: ${state.failOnUpdateKey}`);
			}
		},
		get: async () => {
			state.getCalled += 1;
			return reReadOrg;
		},
	},
}));
mock.module("@/internal/dev/api-keys/apiKeyUtils.js", () => ({
	createKey: async () => {
		if (state.keyThrows) {
			throw new Error("createKey failed");
		}
		return "am_sk_test_generated";
	},
}));
mock.module("@/internal/orgs/deleteOrg/deletePlatformSubOrg.js", () => ({
	deletePlatformSubOrg: async ({ org }: { org: Record<string, unknown> }) => {
		state.teardownOrg = org;
	},
}));

import { provisionSubOrg } from "@/internal/orgs/orgUtils/provisionSubOrg.js";
import { createSandboxForOrg } from "@/internal/sandboxes/createSandbox.js";
import { provisionOrgResources } from "@/utils/authUtils/afterOrgCreated.js";

const fakeDb = {
	insert: () => ({
		values: (vals: Record<string, unknown>) => {
			const p = Promise.resolve([{ ...vals }]) as Promise<unknown[]> & {
				returning?: () => Promise<unknown[]>;
			};
			p.returning = async () => [{ ...vals }];
			return p;
		},
	}),
	delete: (table: unknown) => ({
		where: async () => {
			state.rowDeletes.push(
				table === member
					? "member"
					: table === organizations
						? "organizations"
						: "other",
			);
		},
	}),
} as never;

const org = {
	id: "org_sub",
	slug: "my-sandbox|org_master",
	createdAt: new Date(0),
	created_by: "org_master",
} as never;
const user = { id: "u1", email: "a@b.c" } as never;

beforeEach(() => {
	state.createdSvixApps = [];
	state.deletedAccounts = [];
	state.deletedSvixApps = [];
	state.rowDeletes = [];
	state.getCalled = 0;
	state.teardownOrg = null;
	state.createConnectThrows = false;
	state.failOnUpdateKey = null;
	state.svixSandbox = "ok";
	state.svixLive = "ok";
	state.keyThrows = false;
	process.env.SVIX_API_KEY = "test_key";
});

describe("provisionOrgResources rollback (external resources)", () => {
	const provision = (strict: boolean) =>
		provisionOrgResources({ org, user, strict });

	test("happy path provisions without rolling anything back", async () => {
		await provision(true);
		expect(state.deletedAccounts).toEqual([]);
		expect(state.deletedSvixApps).toEqual([]);
		expect(state.createdSvixApps.sort()).toEqual(["app_live", "app_sandbox"]);
	});

	test("both svix apps fail after stripe: closes the account, no svix to clean", async () => {
		state.svixSandbox = "undef";
		state.svixLive = "undef";
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual(["acct_test"]);
		expect(state.deletedSvixApps).toEqual([]);
	});

	test("asymmetric svix (one created, one fails): rolls back the created app + the account", async () => {
		state.svixLive = "undef";
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual(["acct_test"]);
		expect(state.deletedSvixApps).toEqual(["app_sandbox"]);
	});

	test("svix_config DB write fails: rolls back account + both apps", async () => {
		state.failOnUpdateKey = "svix_config";
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual(["acct_test"]);
		expect(state.deletedSvixApps.sort()).toEqual(["app_live", "app_sandbox"]);
	});

	test("test_stripe_connect DB write fails: closes exactly that account, no svix", async () => {
		state.failOnUpdateKey = "test_stripe_connect";
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual(["acct_test"]);
		expect(state.deletedSvixApps).toEqual([]);
	});

	test("createConnectAccount throws (no account): rethrows, rolls back nothing", async () => {
		state.createConnectThrows = true;
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual([]);
		expect(state.deletedSvixApps).toEqual([]);
	});

	test("first DB write (created_at) fails: rethrows, rolls back nothing", async () => {
		state.failOnUpdateKey = "created_at";
		await expect(provision(true)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual([]);
		expect(state.deletedSvixApps).toEqual([]);
	});

	test("non-strict rethrows but does not roll back", async () => {
		state.failOnUpdateKey = "svix_config";
		await expect(provision(false)).rejects.toThrow();
		expect(state.deletedAccounts).toEqual([]);
		expect(state.deletedSvixApps).toEqual([]);
	});

	test("non-strict tolerates missing svix apps and does not throw", async () => {
		state.svixSandbox = "undef";
		state.svixLive = "undef";
		await provision(false);
		expect(state.deletedAccounts).toEqual([]);
	});
});

describe("provisionSubOrg rollback (local rows)", () => {
	const call = (createMembership: boolean) =>
		provisionSubOrg({
			db: fakeDb,
			masterOrg: { id: "org_master" } as never,
			actorUser: user,
			slug: "my-sandbox|org_master",
			name: "My Sandbox",
			isSandbox: true,
			createMembership,
		});

	test("provisioning fails (no membership): deletes the org row and rethrows", async () => {
		state.createConnectThrows = true;
		await expect(call(false)).rejects.toThrow();
		expect(state.rowDeletes).toContain("organizations");
		expect(state.getCalled).toBe(0);
	});

	test("provisioning fails (with membership): deletes member + org rows", async () => {
		state.createConnectThrows = true;
		await expect(call(true)).rejects.toThrow();
		expect(state.rowDeletes).toEqual(
			expect.arrayContaining(["member", "organizations"]),
		);
	});

	test("success re-reads the provisioned org (external ids present), no deletes", async () => {
		const result = await call(false);
		expect(state.rowDeletes).toEqual([]);
		expect(state.getCalled).toBe(1);
		expect(
			(result as { test_stripe_connect?: { default_account_id?: string } })
				.test_stripe_connect?.default_account_id,
		).toBe("acct_test");
		expect((result as { master?: { id: string } }).master?.id).toBe(
			"org_master",
		);
	});
});

describe("createSandboxForOrg teardown (key-failure)", () => {
	const call = () =>
		createSandboxForOrg({
			db: fakeDb,
			masterOrg: { id: "org_master" } as never,
			actorUser: user,
			name: "My Sandbox",
		});

	test("createKey failure tears down the fully-provisioned org and rethrows", async () => {
		state.keyThrows = true;
		await expect(call()).rejects.toThrow();
		expect(state.teardownOrg?.id).toBe("org_sub");
		// teardown must receive the re-read org so it can clean the external ids
		expect(
			(
				state.teardownOrg as {
					test_stripe_connect?: { default_account_id?: string };
				}
			)?.test_stripe_connect?.default_account_id,
		).toBe("acct_test");
	});

	test("happy path returns org + key without tearing down", async () => {
		const res = await call();
		expect(res.secret_key).toBe("am_sk_test_generated");
		expect(res.org.id).toBe("org_sub");
		expect(state.teardownOrg).toBeNull();
	});
});
