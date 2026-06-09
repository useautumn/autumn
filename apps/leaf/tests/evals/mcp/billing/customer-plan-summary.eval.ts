import { Eval } from "braintrust";
import { withCustomers } from "../../fixtures/createSetup.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	createEvalContext,
	createGenericMcpAgentDriver,
} from "../../harness/index.js";
import {
	type EvalExpected,
	type EvalOutput,
	expectedApiCalls,
	expectedToolCalls,
	finalTextIncludes,
} from "../../utils/scorers.js";

type EvalInput = {
	confirmation: string;
	prompt: string;
};

type EvalMetadata = {
	domain: "billing";
	setup: string;
};

const experimentName = "customer-plan";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers, plans, subscriptions }) => ({
		joe: customers.active({
			id: "joe_customer",
			name: "Joe",
			subscriptions: [
				subscriptions.active({
					currentPeriodEnd: new Date("2026-02-07T00:00:00.000Z"),
					currentPeriodStart: new Date("2026-01-01T00:00:00.000Z"),
					id: "sub_joe_scale_custom",
					plan: plans.scale,
				}),
			],
		}),
	}),
});
const customer = setup.refs.customers.joe;

Eval<EvalInput, EvalOutput, EvalExpected, EvalMetadata>(
	"leaf",
	{
		experimentName,
		data: [
			{
				expected: {
					apiCalls: [{ toolName: "listCustomers" }],
					finalTextIncludes: [
						"Joe",
						"Scale",
						"$500",
						"Credits",
						"Insight Reports",
					],
					toolCalls: ["listCustomers"],
				},
				input: {
					confirmation: `Yes, use ${customer.id}.`,
					prompt: "what plan is Joe on?",
				},
				metadata: {
					domain: "billing",
					setup: setup.tag,
				},
			},
		],
		scores: [
			(args) => ({
				name: "Expected tool calls",
				score: expectedToolCalls(args),
			}),
			(args) => ({
				name: "Expected API calls",
				score: expectedApiCalls(args),
			}),
			(args) => ({
				name: "Final text includes",
				score: finalTextIncludes(args),
			}),
		],
		task: async (input) => {
			const context = await createEvalContext({
				driver: createGenericMcpAgentDriver(),
				name: experimentName,
				setup,
			});
			try {
				return await context.runConversation([
					{ message: input.prompt, type: "user" },
					{ message: input.confirmation, type: "user" },
				]);
			} finally {
				await context.cleanup();
			}
		},
		timeout: 45_000,
	},
	{ noSendLogs: !process.env.BRAINTRUST_API_KEY },
);
