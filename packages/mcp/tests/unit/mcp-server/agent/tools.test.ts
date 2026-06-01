import { describe, expect, test } from "bun:test";
import type { AutumnMcpAuth } from "../../../../src/mcp-server/agent/auth.js";
import {
	clearPendingActions,
	claimLatestPendingAction,
	createPendingAction,
	setPendingActionsRedis,
} from "../../../../src/mcp-server/agent/pending-actions.js";
import { createTestRedis } from "../../../utils/test-redis.js";
import {
	createAgentAutumnOperationTools,
	createRawAutumnOperationTools,
} from "../../../../src/mcp-server/agent/tools.js";

setPendingActionsRedis(createTestRedis());

type ExecutableTool = {
	execute?: (input: unknown, context: unknown) => Promise<unknown>;
};

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read", "billing:write"],
	serverURL: "http://localhost:8080",
};

describe("Autumn operation tools", () => {
	test("read tool descriptions include composition guidance", () => {
		const tools = createRawAutumnOperationTools();

		expect(tools.listPlans.description).toContain("cheap full scan");
		expect(tools.listPlans.description).toContain("filter returned plans locally");
		expect(tools.listCustomers.description).toContain("plans");
		expect(tools.listCustomers.description).toContain("paginate");
		expect(tools.createPlan.description).toContain("confirmation");
		expect(tools.createSchedule.description).toContain("phase start times");
		expect(tools.previewCreateSchedule.description).toContain("billing impact");
	});

	test("raw createCustomer calls the get-or-create endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/customers.get_or_create");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
				email: "charlie@example.com",
			});
			return Response.json({ id: "cus_1" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createCustomer;
			if (!tool.execute) throw new Error("createCustomer is not executable");

			await expect(
				tool.execute(
					{ request: { customer_id: "cus_1", email: "charlie@example.com" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ id: "cus_1" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw createPlan calls the create plan endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/plans.create");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				plan_id: "pro",
				name: "Pro",
			});
			return Response.json({ id: "pro" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createPlan;
			if (!tool.execute) throw new Error("createPlan is not executable");

			await expect(
				tool.execute(
					{ request: { plan_id: "pro", name: "Pro" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ id: "pro" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw createSchedule calls the create schedule endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe("http://localhost:8080/v1/billing.create_schedule");
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
			});
			return Response.json({ schedule_id: "sch_1" });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().createSchedule;
			if (!tool.execute) throw new Error("createSchedule is not executable");

			await expect(
				tool.execute(
					{
						request: {
							customer_id: "cus_1",
							phases: [
								{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] },
							],
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ schedule_id: "sch_1" });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("raw previewCreateSchedule calls the preview create schedule endpoint", async () => {
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url, init) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_create_schedule",
			);
			expect(JSON.parse(init?.body as string)).toMatchObject({
				customer_id: "cus_1",
			});
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const tool = createRawAutumnOperationTools().previewCreateSchedule;
			if (!tool.execute) {
				throw new Error("previewCreateSchedule is not executable");
			}

			await expect(
				tool.execute(
					{
						request: {
							customer_id: "cus_1",
							phases: [
								{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] },
							],
						},
					},
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toEqual({ total: 50 });
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

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

	test("agent createPlan stores a pending write instead of calling Autumn", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (() => {
			throw new Error("createPlan should not call Autumn before confirmation");
		}) as unknown as typeof fetch;

		try {
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					createPlan: ExecutableTool;
				}
			).createPlan;
			if (!tool.execute) throw new Error("createPlan is not executable");

			await expect(
				tool.execute(
					{ request: { plan_id: "pro", name: "Pro" } },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toMatchObject({ pending: true });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "createPlan",
				request: { plan_id: "pro", name: "Pro" },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	test("agent previewCreateSchedule stores a pending write after preview", async () => {
		await clearPendingActions();
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async (url) => {
			expect(String(url)).toBe(
				"http://localhost:8080/v1/billing.preview_create_schedule",
			);
			return Response.json({ total: 50 });
		}) as typeof fetch;

		try {
			const request = {
				customer_id: "cus_1",
				phases: [{ starts_at: Date.now(), plans: [{ plan_id: "pro" }] }],
			};
			const tool = (
				createAgentAutumnOperationTools() as unknown as {
					previewCreateSchedule: ExecutableTool;
				}
			).previewCreateSchedule;
			if (!tool.execute) {
				throw new Error("previewCreateSchedule is not executable");
			}

			await expect(
				tool.execute(
					{ request },
					{ mcp: { extra: { authInfo: auth } } } as never,
				),
			).resolves.toMatchObject({ pending: true });

			await expect(claimLatestPendingAction(auth)).resolves.toMatchObject({
				toolName: "createSchedule",
				request,
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
