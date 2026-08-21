import type { AppEnv } from "@autumn/shared";
import { autumnMcpHeaders } from "./headers.js";

export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
export type JsonSchemaObject = { [key: string]: JsonValue };

export type AutumnMcpToolMetadata = {
	description: string;
	inputSchema: JsonSchemaObject;
	name: string;
};

/** Minimal JSON-RPC over streamable HTTP against the Autumn MCP server:
 * mastra's client discards the wire schema JSON and the MCP SDK's deep
 * imports don't resolve in the agent bundle, so this path exists for code
 * that needs the exact tools/list payloads (the direct-tool resolver). */
const openMcpRpcSession = async ({
	appEnv,
	baseUrl,
	token,
}: {
	appEnv: AppEnv;
	baseUrl: string;
	token: string;
}) => {
	const url = new URL("/mcp", baseUrl);
	const headers: Record<string, string> = {
		...autumnMcpHeaders({ appEnv, token }),
		accept: "application/json, text/event-stream",
		"content-type": "application/json",
	};
	let requestId = 0;
	const sendRpc = async (method: string, params: Record<string, unknown>) => {
		requestId += 1;
		const response = await fetch(url, {
			body: JSON.stringify({ id: requestId, jsonrpc: "2.0", method, params }),
			headers,
			method: "POST",
		});
		const sessionId = response.headers.get("mcp-session-id");
		if (sessionId) headers["mcp-session-id"] = sessionId;
		const text = await response.text();
		const payload = text.startsWith("event:")
			? (text
					.split("\n")
					.find((line) => line.startsWith("data:"))
					?.slice(5) ?? "{}")
			: text;
		return payload ? JSON.parse(payload) : {};
	};
	const close = async () => {
		if (!headers["mcp-session-id"]) return;
		await fetch(url, { headers, method: "DELETE" }).catch(() => undefined);
	};
	await sendRpc("initialize", {
		capabilities: {},
		clientInfo: { name: "leaf-direct-tools", version: "1.0.0" },
		protocolVersion: "2025-03-26",
	});
	return { close, sendRpc };
};

export const callAutumnMcpTool = async ({
	args,
	baseUrl,
	env: appEnv,
	token,
	toolName,
}: {
	args: Record<string, unknown>;
	baseUrl: string;
	env: AppEnv;
	token: string;
	toolName: string;
}) => {
	const { close, sendRpc } = await openMcpRpcSession({
		appEnv,
		baseUrl,
		token,
	});
	try {
		const response = await sendRpc("tools/call", {
			arguments: args,
			name: toolName,
		});
		if (response.error) {
			throw new Error(
				`Autumn MCP tools/call failed: ${JSON.stringify(response.error).slice(0, 400)}`,
			);
		}
		return response.result;
	} finally {
		await close();
	}
};

export const listAutumnMcpTools = async ({
	baseUrl,
	env: appEnv,
	token,
}: {
	baseUrl: string;
	env: AppEnv;
	token: string;
}): Promise<AutumnMcpToolMetadata[]> => {
	const { close, sendRpc } = await openMcpRpcSession({
		appEnv,
		baseUrl,
		token,
	});
	try {
		const listed = await sendRpc("tools/list", {});
		const tools = (listed.result?.tools ?? []) as Array<{
			description?: string;
			inputSchema?: JsonSchemaObject;
			name: string;
		}>;
		return tools.map((tool) => ({
			description: tool.description ?? tool.name,
			inputSchema: tool.inputSchema ?? { type: "object" },
			name: tool.name,
		}));
	} finally {
		await close();
	}
};
