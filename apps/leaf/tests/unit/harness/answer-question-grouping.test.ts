import { describe, expect, mock, test } from "bun:test";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

mock.module("../../../src/lib/env.js", () => ({ env: {} }));
mock.module("../../../src/lib/db.js", () => ({ db: {} }));

const mockLeafModule = ({
	factory,
	specifier,
}: {
	factory: () => Record<string, unknown>;
	specifier: string;
}) => mockModuleWithRestore({ baseUrl: import.meta.url, factory, specifier });

const chainedCalls: Array<Record<string, unknown>> = [];
await mockLeafModule({
	specifier: "../../../src/internal/approvals/actions/createChainedApproval.js",
	factory: () => ({
		createChainedApproval: async (input: Record<string, unknown>) => {
			chainedCalls.push(input);
			return "chat_app_1";
		},
	}),
});

await mockLeafModule({
	specifier:
		"../../../src/internal/agentRuntime/actions/submitAgentInput/submitAgentInput.js",
	factory: () => ({
		submitAgentInput: async () => ({
			chained: {
				input: { request: { customer_id: "cus_1" } },
				requestId: "req_1",
				toolName: "autumn__updateCustomer",
			},
			chainedSiblingRequestIds: ["req_2"],
			chainedWithheld: [
				{
					input: { request: { plan_id: "launch" } },
					requestId: "req_2",
					toolName: "autumn__attach",
				},
			],
			text: "",
		}),
	}),
});

await mockLeafModule({
	specifier: "../../../src/internal/agentRuntime/eve/repo.js",
	factory: () => ({
		getEveSessionBySessionId: async () => ({ sessionId: "eve_1", state: {} }),
	}),
});

const { answerAgentQuestion } = await import(
	"../../../src/internal/agentRuntime/actions/answerAgentQuestion/answerAgentQuestion.js"
);

// Answering a question rebuilds the card, so the grouped writes must survive it
// — otherwise half the request is silently dropped.
describe("answering a question keeps the grouped writes", () => {
	test("passes the withheld writes to the chained approval", async () => {
		chainedCalls.length = 0;
		await answerAgentQuestion({
			auth: { orgId: "org_1", providerUserId: "U1" } as never,
			optionId: "opt_1",
			orgId: "org_1",
			requestId: "req_0",
			sessionId: "eve_1",
		} as never);

		expect(chainedCalls[0]?.withheld).toHaveLength(1);
	});
});
