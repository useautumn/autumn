import { describe, expect, test } from "bun:test";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import {
	instrumentToolsWithAnalytics,
	type McpAnalyticsEvent,
	setAnalyticsSink,
} from "../../../src/analytics/index.js";
import type { AutumnMcpAuth } from "../../../src/server/auth/auth.js";

const auth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "user_1",
	resource: "http://localhost:2718/mcp",
	scopes: ["billing:read"],
	serverURL: "http://localhost:8080",
};

const waitForEvent = async (events: McpAnalyticsEvent[]) => {
	for (let i = 0; i < 20; i++) {
		if (events.length > 0) return events[0];
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
	throw new Error("Timed out waiting for analytics event");
};

describe("MCP analytics instrumentation", () => {
	test("emits successful tool calls", async () => {
		const events: McpAnalyticsEvent[] = [];
		const originalFetch = globalThis.fetch;
		globalThis.fetch = (async () =>
			Response.json({ id: "org_1", slug: "acme" })) as unknown as typeof fetch;
		setAnalyticsSink({
			emit: (event: McpAnalyticsEvent) => events.push(event),
			flush: async () => {},
		});

		try {
			const tools = instrumentToolsWithAnalytics({
				surface: "mcp",
				tools: {
					echo: createTool({
						id: "echo",
						description: "Echo input",
						inputSchema: z.object({ intent: z.string(), request: z.unknown() }),
						execute: async ({ request }) => ({ request }),
					}),
				},
			});

			await expect(
				tools.echo.execute?.({ intent: "echo input", request: { ok: true } }, {
					mcp: {
						extra: {
							authInfo: auth,
							requestInfo: {
								headers: {
									"mcp-session-id": "mcp_session_1",
									"user-agent": "Claude Code",
								},
							},
						},
					},
				} as never),
			).resolves.toEqual({ request: { ok: true } });

			await expect(waitForEvent(events)).resolves.toMatchObject({
				event: "mcp.tool_call",
				surface: "mcp",
				tool: "echo",
				intent: "echo input",
				status: "ok",
				principalId: "user_1",
				client: "Claude Code",
				sessionId: "mcp_session_1",
				context: {
					orgId: "org_1",
					orgSlug: "acme",
					env: "sandbox",
				},
				input: { ok: true },
				output: { request: { ok: true } },
			});
		} finally {
			setAnalyticsSink(undefined);
			globalThis.fetch = originalFetch;
		}
	});

	test("emits errors and rethrows", async () => {
		const events: McpAnalyticsEvent[] = [];
		setAnalyticsSink({
			emit: (event: McpAnalyticsEvent) => events.push(event),
			flush: async () => {},
		});

		try {
			const tools = instrumentToolsWithAnalytics({
				surface: "agent",
				tools: {
					fail: createTool({
						id: "fail",
						description: "Fail input",
						inputSchema: z.object({ intent: z.string() }),
						execute: async () => {
							throw new Error("nope");
						},
					}),
				},
			});

			await expect(
				tools.fail.execute?.({ intent: "fail intentionally" }, {
					mcp: { extra: { authInfo: auth } },
				} as never),
			).rejects.toThrow("nope");

			await expect(waitForEvent(events)).resolves.toMatchObject({
				surface: "agent",
				tool: "fail",
				intent: "fail intentionally",
				status: "error",
				error: "nope",
			});
		} finally {
			setAnalyticsSink(undefined);
		}
	});
});
