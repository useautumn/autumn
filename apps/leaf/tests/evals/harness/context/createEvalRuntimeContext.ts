import type { AutumnMcpAuth } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../../fixtures/types.js";
import type { EvalTrace } from "../tracing/types.js";
import { createAutumnApiMock } from "./createAutumnApiMock.js";
import { createAutumnMcpServer } from "./createAutumnMcpServer.js";
import type { AutumnApiMockOverrides, EvalRuntimeContext } from "./types.js";

const defaultAuth: AutumnMcpAuth = {
	apiKey: "sk_test",
	env: "sandbox",
	principalId: "eval-user",
	resource: "http://localhost:2718/mcp",
	scopes: [
		"customers:read",
		"customers:write",
		"plans:read",
		"billing:read",
		"billing:write",
		"balances:write",
	],
	serverURL: "http://localhost:8080",
};

export const createEvalRuntimeContext = async ({
	auth = {},
	autumnApiOverrides,
	setup,
	trace,
}: {
	auth?: Partial<AutumnMcpAuth>;
	autumnApiOverrides?: AutumnApiMockOverrides;
	setup: EvalSetup;
	trace: EvalTrace;
}): Promise<EvalRuntimeContext> => {
	const resolvedAuth = { ...defaultAuth, ...auth };
	const autumnApi = createAutumnApiMock({
		overrides: autumnApiOverrides,
		setup,
		trace,
	});
	const mcpServer = await createAutumnMcpServer(resolvedAuth);

	return {
		auth: resolvedAuth,
		autumnApi,
		cleanup: async () => {
			autumnApi.restore();
			await mcpServer.close();
		},
		mcpServer,
	};
};
