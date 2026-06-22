import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";

const state = {
	target: null as null | Record<string, unknown>,
	updateCalls: [] as Array<Record<string, unknown>>,
};

mock.module("@/db/initDrizzle.js", () => ({
	db: {},
	initDrizzle: () => ({ db: {} }),
}));
mock.module("@/internal/orgs/OrgService.js", () => ({
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
		update: async (args: Record<string, unknown>) => {
			state.updateCalls.push(args);
		},
	},
}));

import { updateSandboxForOrg } from "@/internal/sandboxes/updateSandbox.js";

const masterOrg = { id: "org_master" } as never;
const db = {} as never;

const sandbox = (over: Record<string, unknown> = {}) => ({
	id: "org_sandbox",
	created_by: "org_master",
	is_sandbox: true,
	...over,
});

const call = (
	sandboxId: string,
	updates: { name?: string; color?: string; icon?: string },
) =>
	updateSandboxForOrg({
		db,
		masterOrg,
		sandboxId,
		updates: updates as never,
	});

beforeEach(() => {
	state.target = null;
	state.updateCalls = [];
});

describe("updateSandboxForOrg (ownership-guarded)", () => {
	test("updates an owned sandbox, mapping tokens to columns", async () => {
		state.target = sandbox();
		await call("org_sandbox", {
			name: "Renamed",
			color: "blue",
			icon: "rocket",
		});
		expect(state.updateCalls.length).toBe(1);
		expect(state.updateCalls[0]).toMatchObject({
			orgId: "org_sandbox",
			updates: {
				name: "Renamed",
				sandbox_color: "blue",
				sandbox_icon: "rocket",
			},
		});
	});

	test("leaves omitted fields untouched (only sets provided keys)", async () => {
		state.target = sandbox();
		await call("org_sandbox", { color: "amber" });
		expect(state.updateCalls[0].updates).toEqual({ sandbox_color: "amber" });
	});

	test("rejects a missing org (OrgNotFound/404), no update", async () => {
		state.target = null;
		await expect(call("nope", { color: "blue" })).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.updateCalls.length).toBe(0);
	});

	test("rejects updating the master org itself", async () => {
		state.target = sandbox({ id: "org_master" });
		await expect(call("org_master", { color: "blue" })).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.updateCalls.length).toBe(0);
	});

	test("rejects a non-sandbox child org", async () => {
		state.target = sandbox({ is_sandbox: false });
		await expect(call("org_sandbox", { color: "blue" })).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.updateCalls.length).toBe(0);
	});

	test("rejects a foreign org's sandbox", async () => {
		state.target = sandbox({ created_by: "org_attacker" });
		await expect(call("org_sandbox", { color: "blue" })).rejects.toMatchObject({
			code: ErrCode.OrgNotFound,
		});
		expect(state.updateCalls.length).toBe(0);
	});
});
