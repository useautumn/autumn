import { afterEach, expect } from "bun:test";
import { Agent } from "@mastra/core/agent";
import type { MessageListItem } from "@mastra/core/agent/message-list";
import type * as z from "zod/v4";
import {
	type AutumnMcpAuth,
	createRequestContext,
} from "../../src/mcp-server/agent/auth.js";
import {
	createRawAutumnOperationTools,
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
const cleanupFns: (() => void)[] = [];
const toolEntries = Object.entries(endpointByTool) as [
	EndpointToolName,
	string,
][];
const summarize = (value: unknown) => JSON.stringify(value, null, 2);

afterEach(() => {
	for (const cleanup of cleanupFns.splice(0).reverse()) cleanup();
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
};

export const createMcpConsumerAgent = () =>
	new Agent({
		id: "mcp-consumer-eval",
		name: "MCP Consumer Eval",
		description: "A generic agent using MCP tools.",
		instructions: "You are a helpful assistant.",
		model: "anthropic/claude-sonnet-4-6",
		tools: createRawAutumnOperationTools(),
	});

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
	const agent = createMcpConsumerAgent();
	let messages: MessageListItem[] = [];
	const toolCalls: { name: string; args: Record<string, unknown> }[] = [];
	cleanupFns.push(api.restore);

	return {
		api,
		auth: resolvedAuth,
		toolCalls,
		generate: async (message: string | string[], maxSteps = 4) => {
			messages.push({
				role: "user",
				content: Array.isArray(message) ? message.join("\n") : message,
			});
			const output = await agent.generate(messages, {
				maxSteps,
				requestContext: createRequestContext(resolvedAuth),
				context: today
					? [
							{
								role: "system",
								content: `Current date: ${today.toISOString()}. Resolve relative dates using calendar time.`,
							},
						]
					: undefined,
				onIterationComplete: ({ toolCalls: calls }) => {
					toolCalls.push(...calls);
				},
			});
			messages = output.messages;
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
