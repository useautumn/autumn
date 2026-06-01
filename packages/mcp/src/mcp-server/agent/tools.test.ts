import { describe, expect, test } from "bun:test";
import type { AutumnMcpAuth } from "./auth.js";
import {
	clearPendingActions,
	claimLatestPendingAction,
	createPendingAction,
	setPendingActionsRedis,
} from "./pending-actions.js";
import { createTestRedis } from "./test-redis.js";
import {
	createAgentAutumnOperationTools,
	createRawAutumnOperationTools,
} from "./tools.js";

setPendingActionsRedis(createTestRedis());

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read", "billing:write"],
	serverURL: "http://localhost:8080",
};

describe("Autumn operation tools", () => {
	test("raw listCustomers calls the list endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/customers.list");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				search: "charlie",
			});
			return Response.json({ customers: [] });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().listCustomers;
			if (!tool.execute) throw new Error("listCustomers is not executable");

			await expect(
				tool.execute(
					{ request: { search: "charlie" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ customers: [] });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw previewAttach does not create a pending action", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.preview_attach");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().previewAttach;
			if (!tool.execute) throw new Error("previewAttach is not executable");

			await expect(
				tool.execute(
					{ request: { customer_id: "cus_1", plan_id: "pro" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ total: 50 });
			await expect(claimLatestPendingAction(auth)).rejects.toThrow("No pending");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw attach calls the write endpoint directly", async () => {
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
			const tool = createRawAutumnOperationTools().attach;
			if (!tool.execute) throw new Error("attach is not executable");

			await expect(
				tool.execute(
					{ request: { customer_id: "cus_1", plan_id: "pro" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ ok: true });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("previewAttach stores the exact pending attach action", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.preview_attach");
			expect(JSON.parse(init?.body as string)).toEqual({
				customer_id: "cus_1",
				plan_id: "pro",
				redirect_mode: "if_required",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					previewAttach: {
						execute?: (input: unknown, context: unknown) => Promise<unknown>;
					};
				}
			).previewAttach;
			if (!tool.execute) throw new Error("previewAttach is not executable");

			await expect(
				tool.execute(
					{ request: { customer_id: "cus_1", plan_id: "pro" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toMatchObject({ pending: true, preview: { total: 50 } });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "attach",
				request: {
					customer_id: "cus_1",
					plan_id: "pro",
					redirect_mode: "if_required",
				},
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("confirmBillingAction executes only the stored pending billing action", async () => {
		await clearPendingActions();
		await createPendingAction({
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
			const tool = createAgentAutumnOperationTools().confirmBillingAction;
			if (!tool.execute) throw new Error("confirmBillingAction is not executable");

			await expect(
				tool.execute({}, { mcp: { extra: { authInfo: auth } } } as never),
			).resolves.toMatchObject({
				message: "Confirmed and applied attach.",
				result: { ok: true },
			});
			await expect(claimLatestPendingAction(auth)).rejects.toThrow("No pending");
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
