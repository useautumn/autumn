import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterEach, expect } from "bun:test";
import { Agent } from "@mastra/core/agent";
import type { MessageListItem } from "@mastra/core/agent/message-list";
import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { MCPClient } from "@mastra/mcp";
import type * as z from "zod/v4";
import {
	type AutumnMcpAuth,
	createRequestContext,
} from "../../src/mcp-server/agent/auth.js";
import { createAutumnOperationsMCPServer } from "../../src/mcp-server/agent/server.js";
import {
	endpointByTool,
	schemaByTool,
} from "../../src/mcp-server/agent/tools.js";

type ToolName = keyof typeof schemaByTool;
type EndpointToolName = keyof typeof endpointByTool;
export type ToolRequest<Tool extends ToolName> = z.output<
	(typeof schemaByTool)[Tool]
>;
export type ToolRequestInput<Tool extends ToolName> = z.input<
	(typeof schemaByTool)[Tool]
>;
type ToolCall = { name: string; args: Record<string, unknown> };
type PendingApproval = {
	runId: string;
	toolCallId?: string;
};
type AutumnApiFixture = {
	[Tool in EndpointToolName]?: unknown | ((body: ToolRequest<Tool>) => unknown);
};
type AutumnApiCall<Tool extends EndpointToolName = EndpointToolName> = {
	toolName: Tool;
	endpoint: string;
	body: ToolRequest<Tool>;
	rawBody: ToolRequestInput<Tool>;
};
type UnknownAutumnApiCall = {
	toolName: null;
	endpoint: string;
	body: unknown;
	rawBody: unknown;
};

const serverURL = "http://localhost:8080";
const cleanupFns: (() => void | Promise<void>)[] = [];
const toolEntries = Object.entries(endpointByTool) as [
	EndpointToolName,
	string,
][];
const summarize = (value: unknown) => JSON.stringify(value, null, 2);

afterEach(async () => {
	for (const cleanup of cleanupFns.splice(0).reverse()) await cleanup();
});

const defaultAuth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "eval-user",
	resource: "http://localhost:2718/mcp",
	scopes: [
		"customers:read",
		"plans:read",
		"billing:read",
		"billing:write",
		"balances:write",
	],
	serverURL,
} satisfies AutumnMcpAuth;

const closeServer = (server: Server) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});

const startMcpServer = (auth: AutumnMcpAuth) =>
	new Promise<{ url: URL; close: () => Promise<void> }>((resolve) => {
		const server = createServer(async (req, res) => {
			const url = new URL(req.url ?? "/mcp", `http://${req.headers.host}`);
			if (url.pathname !== "/mcp") {
				res.writeHead(404).end();
				return;
			}

			(req as IncomingMessage & { auth?: AutumnMcpAuth }).auth = auth;
			await createAutumnOperationsMCPServer().startHTTP({
				url,
				httpPath: "/mcp",
				req,
				res,
				options: { serverless: true },
			});
		});
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				throw new Error("MCP eval server did not bind to a TCP port.");
			}
			resolve({
				url: new URL(`http://127.0.0.1:${address.port}/mcp`),
				close: () => closeServer(server),
			});
		});
	});

const createMcpConsumerAgent = async (auth: AutumnMcpAuth) => {
	const server = await startMcpServer(auth);
	const mcpClient = new MCPClient({
		id: `mcp-eval-${crypto.randomUUID()}`,
		servers: {
			autumn: {
				url: server.url,
				requireToolApproval: ({ annotations }) =>
					annotations?.destructiveHint === true,
			},
		},
	});
	cleanupFns.push(async () => {
		await mcpClient.disconnect();
		await server.close();
	});

	const { toolsets, errors } = await mcpClient.listToolsetsWithErrors();
	if (Object.keys(errors).length) {
		throw new Error(`MCP tool discovery failed: ${summarize(errors)}`);
	}
	const tools = toolsets.autumn ?? {};
	for (const tool of Object.values(tools)) {
		const requiresApproval = tool.mcp?.annotations?.destructiveHint === true;
		tool.requireApproval = requiresApproval;
		if (!requiresApproval) {
			(tool as typeof tool & { needsApprovalFn?: unknown }).needsApprovalFn =
				undefined;
		}
	}

	const agent = new Agent({
		id: "mcp-consumer-eval",
		name: "MCP Consumer Eval",
		description: "A generic agent using MCP tools.",
		instructions: "You are a helpful assistant.",
		model: "anthropic/claude-sonnet-4-6",
		tools,
	});
	const mastra = new Mastra({
		agents: { eval: agent },
		storage: new InMemoryStore({ id: `mcp-eval-${crypto.randomUUID()}` }),
		logger: false,
	});

	return mastra.getAgent("eval");
};

const mockAutumnApi = ({
	serverURL,
	fixtures,
}: {
	serverURL: string;
	fixtures: AutumnApiFixture;
}) => {
	const calls: (AutumnApiCall | UnknownAutumnApiCall)[] = [];
	const originalFetch = globalThis.fetch;

	globalThis.fetch = (async (url, init) => {
		const requestUrl = new URL(String(url));
		if (requestUrl.origin !== serverURL) {
			return originalFetch(url, init);
		}

		const endpoint = requestUrl.pathname;
		const body = JSON.parse(String(init?.body ?? "{}"));
		const toolName =
			toolEntries.find(([, path]) => endpoint.endsWith(path))?.[0] ?? null;
		const fixture = toolName ? fixtures[toolName] : undefined;
		const parsedBody = toolName ? schemaByTool[toolName].parse(body) : body;
		calls.push({
			toolName,
			endpoint,
			body: parsedBody as never,
			rawBody: body,
		});

		if (fixture === undefined) {
			return Response.json(
				{ error: `No MCP eval fixture for ${toolName ?? endpoint}` },
				{ status: 500 },
			);
		}

		return Response.json(
			typeof fixture === "function"
				? fixture(parsedBody as never)
				: (fixture ?? { ok: true }),
		);
	}) as typeof fetch;

	return {
		calls,
		call: <Tool extends EndpointToolName>(toolName: Tool) =>
			calls.find(
				(call): call is AutumnApiCall<Tool> => call.toolName === toolName,
			),
		callsFor: <Tool extends EndpointToolName>(toolName: Tool) =>
			calls.filter(
				(call): call is AutumnApiCall<Tool> => call.toolName === toolName,
			),
		restore: () => {
			globalThis.fetch = originalFetch;
		},
	};
};
type MockAutumnApi = ReturnType<typeof mockAutumnApi>;

export const initMcpEval = ({
	auth = {},
	fixtures,
	today,
}: {
	auth?: Partial<AutumnMcpAuth>;
	fixtures: AutumnApiFixture;
	today?: Date;
}) => {
	const resolvedAuth = { ...defaultAuth, ...auth };
	const api = mockAutumnApi({
		serverURL: resolvedAuth.serverURL ?? serverURL,
		fixtures,
	});
	let agent: Agent | null = null;
	let messages: MessageListItem[] = [];
	let pendingApproval: PendingApproval | null = null;
	const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
	cleanupFns.push(api.restore);

	const getAgent = async () => {
		agent ??= await createMcpConsumerAgent(resolvedAuth);
		return agent;
	};
	const options = (maxSteps: number) => ({
		maxSteps,
		requestContext: createRequestContext(resolvedAuth),
		context: today
			? [
					{
						role: "system" as const,
						content: `Current date: ${today.toISOString()}. Resolve relative dates using calendar time.`,
					},
				]
			: undefined,
		onIterationComplete: ({ toolCalls: calls }: { toolCalls: ToolCall[] }) => {
			toolCalls.push(...calls);
		},
	});
	const rememberApproval = (output: {
		finishReason?: string;
		runId?: string;
		suspendPayload?: { toolCallId?: string };
	}) => {
		pendingApproval =
			output.finishReason === "suspended" && output.runId
				? {
						runId: output.runId,
						toolCallId: output.suspendPayload?.toolCallId,
					}
				: null;
	};
	const generate = async (message: string | string[], maxSteps = 4) => {
		messages.push({
			role: "user",
			content: Array.isArray(message) ? message.join("\n") : message,
		});
		const output = await (await getAgent()).generate(
			messages,
			options(maxSteps),
		);
		messages = output.messages;
		rememberApproval(output);
		return output;
	};

	return {
		api,
		auth: resolvedAuth,
		toolCalls,
		generate,
		approve: async (message: string, maxSteps = 4) => {
			if (!pendingApproval) await generate(message, maxSteps);
			if (!pendingApproval) {
				throw new Error("No pending MCP tool approval to approve.");
			}

			const output = await (await getAgent()).approveToolCallGenerate({
				...options(maxSteps),
				runId: pendingApproval.runId,
				toolCallId: pendingApproval.toolCallId,
			});
			messages = output.messages;
			rememberApproval(output);
			return output;
		},
	};
};

export const expectToolCall = <Tool extends ToolName>(
	toolCalls: ToolCall[],
	toolName: Tool,
	request?: Partial<ToolRequest<Tool>>,
) => {
	const call = toolCalls.find((call) => call.name === toolName);
	expect(
		call,
		`${toolName} was not called. Called tools:\n${summarize(toolCalls)}`,
	).toBeDefined();
	if (request) {
		const parsedRequest = schemaByTool[toolName].parse(call?.args.request);
		expect(parsedRequest, `${toolName} args did not match`).toMatchObject(
			request,
		);
	}
	return call;
};

export const expectNoToolCall = (toolCalls: ToolCall[], toolName: ToolName) => {
	const call = toolCalls.find((call) => call.name === toolName);
	expect(
		call,
		`${toolName} was called unexpectedly:\n${summarize(call)}`,
	).toBeUndefined();
};

export const expectApiCall = <Tool extends EndpointToolName>(
	api: MockAutumnApi,
	toolName: Tool,
	body?: Partial<ToolRequestInput<Tool>>,
) => {
	const call = api.call(toolName);
	expect(
		call,
		`${toolName} did not call Autumn. Autumn calls:\n${summarize(api.calls)}`,
	).toBeDefined();
	if (body) {
		expect(call?.rawBody, `${toolName} raw body did not match`).toMatchObject(
			body,
		);
	}
	return call;
};

export const expectExactApiCall = <Tool extends EndpointToolName>(
	api: MockAutumnApi,
	toolName: Tool,
	body: ToolRequestInput<Tool>,
) => {
	const calls = api.callsFor(toolName);
	expect(
		calls,
		`${toolName} should call Autumn exactly once. Autumn calls:\n${summarize(api.calls)}`,
	).toHaveLength(1);
	expect(calls[0]?.rawBody, `${toolName} raw body was wrong`).toEqual(body);
	return calls[0];
};

export const expectNoApiCall = (
	api: MockAutumnApi,
	toolName: EndpointToolName,
) => {
	const call = api.call(toolName);
	expect(
		call,
		`${toolName} called Autumn unexpectedly:\n${summarize(call)}`,
	).toBeUndefined();
};
