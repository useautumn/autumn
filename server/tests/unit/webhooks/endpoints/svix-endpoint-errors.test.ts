/**
 * Svix answers are translated at one seam:
 * - a request-validation rejection (400/422) is the caller's mistake, our 400;
 * - 404/409 keep their meaning;
 * - Svix refusing Autumn's own credential (401/403) or throttling (429) is an
 *   operational failure, never reported as the caller's 400;
 * - create reads the signing secret right after; if that read fails, the new
 *   endpoint is deleted so a retry can create it again;
 * - adoption refuses an endpoint another request claimed in the meantime.
 */

import { beforeEach, expect, test } from "bun:test";
import { ErrCode, RecaseError, type WebhookEventType } from "@autumn/shared";
import { ApiException } from "svix";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const calls: string[] = [];
const svixState = {
	getSecret: async (): Promise<{ key: string }> => ({ key: "whsec_x" }),
	claimedUid: undefined as string | undefined,
};

const endpointOut = (overrides: Record<string, unknown> = {}) => ({
	id: "ep_new",
	uid: "billing",
	url: "https://example.com/hook",
	description: "",
	filterTypes: ["billing.updated"],
	disabled: false,
	createdAt: new Date(1),
	updatedAt: new Date(1),
	version: 1,
	...overrides,
});

await mockModuleWithRestore("@/external/svix/svixUtils.js", () => ({
	createSvixCli: () => ({
		endpoint: {
			create: async () => {
				calls.push("create");
				return endpointOut();
			},
			getSecret: async () => {
				calls.push("getSecret");
				return svixState.getSecret();
			},
			delete: async (_app: string, id: string) => {
				calls.push(`delete:${id}`);
			},
			get: async () => {
				calls.push("get");
				return endpointOut({ id: "ep_dash", uid: svixState.claimedUid });
			},
			patch: async () => {
				calls.push("patch");
				return endpointOut({ id: "ep_dash" });
			},
		},
	}),
}));

const { withSvixErrors } = await import(
	"@/external/svix/endpoints/withSvixErrors.js"
);
const { createWebhook } = await import(
	"@/internal/webhooks/actions/createWebhook.js"
);
const { adoptWebhook } = await import(
	"@/internal/webhooks/actions/sync/adoptWebhook.js"
);

const params = {
	id: "billing",
	url: "https://example.com/hook",
	events: ["billing.updated"] as WebhookEventType[],
};

const svixError = (code: number) =>
	new ApiException(code, { detail: "nope" }, new Headers());

const rejectionOf = async (code: number): Promise<unknown> => {
	try {
		await withSvixErrors({
			webhookId: "billing",
			run: () => Promise.reject(svixError(code)),
		});
	} catch (error) {
		return error;
	}
	return undefined;
};

beforeEach(() => {
	calls.length = 0;
	svixState.getSecret = async () => ({ key: "whsec_x" });
	svixState.claimedUid = undefined;
});

test("Svix validation rejections are the caller's 400", async () => {
	for (const code of [400, 422]) {
		const error = await rejectionOf(code);
		expect(error).toBeInstanceOf(RecaseError);
		expect((error as RecaseError).statusCode).toBe(400);
	}
});

test("Svix auth, permission and rate-limit failures are never reported as the caller's 400", async () => {
	for (const code of [401, 403, 429]) {
		const error = await rejectionOf(code);
		expect(error).toBeInstanceOf(ApiException);
		expect((error as ApiException<unknown>).code).toBe(code);
	}
});

test("create deletes the new endpoint when its secret can't be read, and fails", async () => {
	svixState.getSecret = async () => {
		throw new Error("svix timeout");
	};
	await expect(createWebhook({ appId: "app_1", params })).rejects.toThrow(
		"svix timeout",
	);
	expect(calls).toEqual(["create", "getSecret", "delete:ep_new"]);
});

test("adoption refuses a dashboard endpoint another request already claimed", async () => {
	svixState.claimedUid = "someone_else";
	const adoption = adoptWebhook({
		appId: "app_1",
		endpointId: "ep_dash",
		params,
	});
	await expect(adoption).rejects.toBeInstanceOf(RecaseError);
	await expect(adoption).rejects.toMatchObject({
		code: ErrCode.AmbiguousWebhookUrl,
		statusCode: 409,
	});
	expect(calls).not.toContain("patch");

	calls.length = 0;
	svixState.claimedUid = undefined;
	await adoptWebhook({ appId: "app_1", endpointId: "ep_dash", params });
	expect(calls).toEqual(["get", "patch"]);
});
