/**
 * A pooled Autumn MCP session outlives the server that issued it (restart,
 * server-side expiry). The next tools/call answers `-32000 Session not found`
 * as a JSON-RPC error, which the pool treated as an application error: it
 * kept the dead session and every call failed until the TTL evicted it.
 *
 * Red: the stale error surfaces as "Autumn MCP tools/call failed: … Session not found".
 * Green: the pool drops the session, re-initializes, and the call succeeds.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { callAutumnMcpTool } from "../../../src/internal/autumnMcp/rpcClient.js";

const originalFetch = globalThis.fetch;
afterAll(() => {
	globalThis.fetch = originalFetch;
});

const rpcResponse = ({
	body,
	sessionId,
}: {
	body: Record<string, unknown>;
	sessionId: string;
}) =>
	new Response(JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }), {
		headers: {
			"content-type": "application/json",
			"mcp-session-id": sessionId,
		},
	});

describe("pooled MCP session liveness", () => {
	test("a stale session is replaced and the call retried once", async () => {
		const calls: Array<{ method: string; sessionId: string | null }> = [];
		let sessionsOpened = 0;
		globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
			if (init?.method === "DELETE") return new Response(null, { status: 204 });
			const { method } = JSON.parse(String(init?.body)) as { method: string };
			const sentSession = new Headers(init?.headers).get("mcp-session-id");
			calls.push({ method, sessionId: sentSession });
			if (method === "initialize") {
				sessionsOpened += 1;
				return rpcResponse({
					body: { result: {} },
					sessionId: `session_${sessionsOpened}`,
				});
			}
			if (sentSession === "session_1") {
				return rpcResponse({
					body: { error: { code: -32000, message: "Session not found" } },
					sessionId: "session_1",
				});
			}
			return rpcResponse({
				body: { result: { content: [{ text: "ok", type: "text" }] } },
				sessionId: sentSession ?? "",
			});
		}) as typeof fetch;

		const result = await callAutumnMcpTool({
			args: {},
			baseUrl: "http://autumn.test",
			env: AppEnv.Sandbox,
			token: "token_1",
			toolName: "previewCreateSchedule",
		});

		expect(result).toEqual({ content: [{ text: "ok", type: "text" }] });
		expect(sessionsOpened).toBe(2);
		expect(calls.map((call) => call.method)).toEqual([
			"initialize",
			"tools/call",
			"initialize",
			"tools/call",
		]);
	});
});
