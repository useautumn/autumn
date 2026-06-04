import { describe, expect, test } from "bun:test";
import {
	claimLatestPendingAction,
	clearPendingActions,
	createPendingAction,
	setPendingActionsRedis,
} from "../../../../src/agent/pending-actions.js";
import type { AutumnMcpAuth } from "../../../../src/server/auth/auth.js";
import { createTestRedis } from "../../../utils/test-redis.js";

setPendingActionsRedis(createTestRedis());

const auth = (overrides: Partial<AutumnMcpAuth> = {}): AutumnMcpAuth => ({
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["customers:read", "plans:read", "billing:read", "billing:write"],
	...overrides,
});

describe("pending billing actions", () => {
	test("claims the latest action only for the matching auth context", async () => {
		await clearPendingActions();
		await createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro to cus_1",
		});

		await expect(
			claimLatestPendingAction(auth({ principalId: "user_2" })),
		).rejects.toThrow("No pending");
		await expect(claimLatestPendingAction(auth())).resolves.toMatchObject({
			request: {
				customer_id: "cus_1",
				plan_id: "pro",
			},
		});
		await expect(claimLatestPendingAction(auth())).rejects.toThrow(
			"No pending",
		);
	});

	test("claims the latest matching action without exposing tokens", async () => {
		await clearPendingActions();
		await createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "starter" },
			preview: "Attach starter",
		});
		const latest = await createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro",
		});

		await expect(claimLatestPendingAction(auth())).resolves.toMatchObject({
			request: latest.request,
		});
	});

	test("only one concurrent confirmation can claim an action", async () => {
		await clearPendingActions();
		await createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro",
		});

		const results = await Promise.allSettled([
			claimLatestPendingAction(auth()),
			claimLatestPendingAction(auth()),
		]);

		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === "rejected"),
		).toHaveLength(1);
	});
});
