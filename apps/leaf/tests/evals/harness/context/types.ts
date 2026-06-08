import type { AutumnMcpAuth } from "../../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../../fixtures/types.js";

export type AutumnEvalToolName =
	| "attach"
	| "createBalance"
	| "getCustomer"
	| "getOrCreateCustomer"
	| "getPlan"
	| "listCustomers"
	| "listFeatures"
	| "listPlans"
	| "previewAttach"
	| "updateCustomer";

export type AutumnApiCall = {
	toolName: AutumnEvalToolName | null;
	endpoint: string;
	body: Record<string, unknown>;
};

export type AutumnApiMockHandler = ({
	body,
	setup,
}: {
	body: Record<string, unknown>;
	setup: EvalSetup;
}) => unknown;

export type AutumnApiMockOverrides = Partial<
	Record<AutumnEvalToolName, AutumnApiMockHandler>
>;

export type AutumnApiMock = {
	calls: AutumnApiCall[];
	restore(): void;
	serverURL: string;
	setup: EvalSetup;
};

export type EvalMcpServer = {
	close(): Promise<void>;
	url: URL;
};

export type EvalRuntimeContext = {
	auth: AutumnMcpAuth;
	autumnApi: AutumnApiMock;
	cleanup(): Promise<void>;
	mcpServer: EvalMcpServer;
};
