import {
	api,
	billing,
	response,
	tools,
} from "../../fixtures/expectations/index.js";
import { createSetup } from "../../fixtures/createSetup.js";
import { approve, initEval, user } from "../../harness/index.js";
import { billingAttachScores } from "../../utils/scorers.js";

type EvalMetadata = {
	domain: "mcp";
	flow: "approval";
};

const experimentName = "mcp-attach-approval";

const setup = createSetup({
	tag: "mcp-attach-approval",
	features: ({ features }) => ({
		dashboard: features.boolean({ featureId: "dashboard" }),
	}),
	plans: ({ basePrice, features, items, plan }) => ({
		pro: plan.monthly({
			basePrice: basePrice.monthly({ amount: 79 }),
			items: [items.boolean({ feature: features.dashboard })],
			planId: "pro",
		}),
	}),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@atlas.example",
			id: "cus_mcp_attach_approval",
			name: "Atlas Labs",
		}),
	}),
});

const customer = setup.refs.customers.account;
const proPlan = setup.refs.plans.pro;

const expectedAttachRequest = {
	customer_id: customer.id,
	enable_plan_immediately: true,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
	},
	plan_id: proPlan.id,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "mcp",
		flow: "approval",
	},
	scores: billingAttachScores(),
	cases: [
		{
			name: "destructive attach waits for approval",
			conversation: [
				user({
					message:
						"Please attach the Pro plan to Atlas Labs. Preview it first, then attach it after approval.",
				}),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listCustomers",
						"listPlans",
						"previewAttach",
						"attach",
					],
				}),
				billing.previewBeforeWrite({
					preview: {
						body: expectedAttachRequest,
						toolName: "previewAttach",
					},
					write: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				api.calledAfterApproval({
					call: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				response.mentions({
					phrases: ["Atlas Labs", "Pro"],
				}),
			],
		},
	],
});
