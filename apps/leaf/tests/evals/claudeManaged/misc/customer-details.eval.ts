// Conciseness eval: a read-only customer lookup must come back as a handful of
// facts with zero fluff. Required facts are judged semantically (LLM judge),
// so the case fails on missing facts AND on preamble/filler around them.
import { withCustomers } from "../../fixtures/createSetup.js";
import { response, tools } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "customers";
	flow: "details";
};

const experimentName = "customer-details";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ balances, customers, plans }) => ({
		brightline: customers.withPlan({
			balances: {
				credits: balances.metered({
					featureId: "credits",
					granted: 5_000,
					remaining: 3_200,
				}),
			},
			email: "billing@brightline.example",
			id: "brightline-docs",
			name: "Brightline Docs",
			plan: plans.scale,
		}),
	}),
});

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "customers",
		flow: "details",
	},
	timeout: 60_000,
	cases: [
		{
			name: "concise customer details lookup",
			conversation: [
				user({ message: "give me details for customer brightline-docs" }),
			],
			expect: [
				tools.called({ toolNames: ["getCustomer"] }),
				response.concise({
					required: [
						"customer is Brightline Docs (brightline-docs)",
						"on the Scale plan",
						"credits balance: 3,200 remaining of 5,000",
					],
				}),
			],
		},
	],
});
