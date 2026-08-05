import { beforeEach, describe, expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";

const state = {
	target: null as null | Record<string, unknown>,
	deleteCalls: [] as Array<Record<string, unknown>>,
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
		get: async () => {
			if (!state.target) {
				throw new RecaseError({
					message: "Organization not found",
					code: ErrCode.OrgNotFound,
					statusCode: 404,
				});
			}
			return state.target;
		},
	},
}));
await mockModuleWithRestore(
	"@/internal/orgs/deleteOrg/deletePlatformSubOrg.js",
	() => ({
		deletePlatformSubOrg: async (args: Record<string, unknown>) => {
			state.deleteCalls.push(args);
		},
	}),
);

import { deleteSandboxForOrg } from "@/internal/sandboxes/deleteSandbox.js";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const masterOrg = { id: "org_master" } as never;
const db = {} as never;
const logger = { info: () => {}, warn: () => {}, error: () => {} } as never;

const call = (sandboxId: string) =>
	deleteSandboxForOrg({ db, masterOrg, sandboxId, logger });

const sandbox = (over: Record<string, unknown> = {}) => ({
	id: "org_sandbox",
	created_by: "org_master",
	is_sandbox: true,
	...over,
});

beforeEach(() => {
	state.target = null;
	state.deleteCalls = [];
});

describe("deleteSandboxForOrg (ownership-guarded teardown)", () => {
	test("tears down an owned sandbox sub-org", async () => {
		state.target = sandbox();
		await call("org_sandbox");
		expect(state.deleteCalls.length).toBe(1);
		expect((state.deleteCalls[0] as { org?: { id?: string } }).org?.id).toBe(
			"org_sandbox",
		);
	});

	test("keeps the live-customer guard (does not skip it)", async () => {
		state.target = sandbox();
		await call("org_sandbox");
		expect(
			(state.deleteCalls[0] as { skipLiveCustomerCheck?: boolean })
				.skipLiveCustomerCheck,
		).toBeUndefined();
	});

	// A missing org and a non-owned org must be indistinguishable: both report
	// "Sandbox not found", never OrgService.get's "Organization not found"
	// (which would leak whether the id exists at all).
	test("rejects a missing org with the unified 404 message, no teardown", async () => {
		state.target = null;
		await expect(call("nope")).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
			statusCode: 404,
			message: "Sandbox not found",
		});
		expect(state.deleteCalls.length).toBe(0);
	});

	test("rejects deleting the master org itself", async () => {
		state.target = sandbox({ id: "org_master" });
		await expect(call("org_master")).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.deleteCalls.length).toBe(0);
	});

	test("rejects a non-sandbox child org", async () => {
		state.target = sandbox({ is_sandbox: false });
		await expect(call("org_sandbox")).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.deleteCalls.length).toBe(0);
	});

	test("rejects a foreign org's sandbox (created_by != master)", async () => {
		state.target = sandbox({ created_by: "org_attacker" });
		await expect(call("org_sandbox")).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.deleteCalls.length).toBe(0);
	});
});
