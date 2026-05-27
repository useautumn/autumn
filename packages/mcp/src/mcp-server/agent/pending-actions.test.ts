import { describe, expect, test } from "bun:test";
import type { AutumnMcpAuth } from "./auth.js";
import {
	cancelLatestPendingAction,
	cancelPendingAction,
	claimLatestPendingAction,
	claimPendingAction,
	clearPendingActions,
	createPendingAction,
} from "./pending-actions.js";

const auth = (overrides: Partial<AutumnMcpAuth> = {}): AutumnMcpAuth => ({
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["customers:read", "plans:read", "billing:read", "billing:write"],
	...overrides,
});

describe("pending billing actions", () => {
	test("claims an action only for the matching auth context", () => {
		clearPendingActions();
		const action = createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro to cus_1",
		});

		expect(() =>
			claimPendingAction(auth({ principalId: "user_2" }), action.token),
		).toThrow("does not belong");
		expect(claimPendingAction(auth(), action.token).request).toEqual({
			customer_id: "cus_1",
			plan_id: "pro",
		});
		expect(() => claimPendingAction(auth(), action.token)).toThrow("expired");
	});

	test("cancels a matching action", () => {
		clearPendingActions();
		const action = createPendingAction({
			auth: auth(),
			toolName: "updateSubscription",
			request: { customer_id: "cus_1" },
			preview: "Update subscription",
		});

		cancelPendingAction(auth(), action.token);
		expect(() => claimPendingAction(auth(), action.token)).toThrow("expired");
	});

	test("claims and cancels the latest matching action without exposing tokens", () => {
		clearPendingActions();
		createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "starter" },
			preview: "Attach starter",
		});
		const latest = createPendingAction({
			auth: auth(),
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro",
		});

		expect(claimLatestPendingAction(auth()).request).toEqual(latest.request);

		clearPendingActions();
		createPendingAction({
			auth: auth(),
			toolName: "updateSubscription",
			request: { customer_id: "cus_1" },
			preview: "Update subscription",
		});
		cancelLatestPendingAction(auth());
		expect(() => claimLatestPendingAction(auth())).toThrow("No pending");
	});
});
