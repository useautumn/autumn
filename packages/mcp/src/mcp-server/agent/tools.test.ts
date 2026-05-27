import { describe, expect, test } from "bun:test";
import type { AutumnMcpAuth } from "./auth.js";
import {
	clearPendingActions,
	claimLatestPendingAction,
	createPendingAction,
} from "./pending-actions.js";
import { createAutumnOperationTools } from "./tools.js";

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read", "billing:write"],
	serverURL: "http://localhost:8080",
};

describe("Autumn operation tools", () => {
	test("rejects billing confirmations when toolName and request schema do not match", async () => {
		clearPendingActions();
		const tool = createAutumnOperationTools().createBillingConfirmation;
		if (!tool.execute) throw new Error("createBillingConfirmation is not executable");

		await expect(
			tool.execute(
				{
					toolName: "attach",
					request: {
						customer_id: "cus_1",
						cancel_action: "cancel_immediately",
					},
					preview: "Cancel subscription",
				},
				{ mcp: { extra: { authInfo: auth } } } as never,
			),
		).rejects.toThrow("plan_id");

		expect(() => claimLatestPendingAction(auth)).toThrow("No pending");
	});

	test("confirmBillingAction executes only the stored pending billing action", async () => {
		clearPendingActions();
		createPendingAction({
			auth,
			toolName: "attach",
			request: { customer_id: "cus_1", plan_id: "pro" },
			preview: "Attach pro",
		});
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.attach");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ ok: true });
		}) as typeof fetch;

		try {
			const tool = createAutumnOperationTools().confirmBillingAction;
			if (!tool.execute) throw new Error("confirmBillingAction is not executable");

			await expect(
				tool.execute({}, { mcp: { extra: { authInfo: auth } } } as never),
			).resolves.toMatchObject({
				message: "Confirmed and applied attach.",
				result: { ok: true },
			});
			expect(() => claimLatestPendingAction(auth)).toThrow("No pending");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
