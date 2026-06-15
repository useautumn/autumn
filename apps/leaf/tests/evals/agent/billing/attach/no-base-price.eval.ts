import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../../harness/index.js";
import { billingAttachScores } from "../../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "attach-no-base-price";
const annualPrice = 36_000;

// Enterprise has no base price. The agent must ask for commercial terms before
// previewing rather than inventing a price (or attaching at $0).
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@juniper.example",
			id: "cus_attach_no_base_price",
			name: "Juniper Labs",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_juniper",
			name: "Juniper Workspace",
		}),
	}),
});

const customer = setup.refs.customers.account;
const enterprisePlan = setup.refs.plans.enterprise;
const workspace = setup.refs.entities.workspace;

const expectedAttachRequest = {
	customer_id: customer.id,
	customize: {
		price: {
			amount: annualPrice,
			interval: BillingInterval.Year,
		},
	},
	enable_plan_immediately: true,
	entity_id: workspace.id,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
	},
	plan_id: enterprisePlan.id,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	scores: billingAttachScores(),
	cases: [
		{
			name: "ask for base price before previewing enterprise attach",
			conversation: [
				user({
					message:
						"Please put Juniper Labs on the Enterprise plan for Juniper Workspace.",
				}),
				user({ message: "Bill them $36,000 per year." }),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				// Enterprise carries no base price; the agent must ask before previewing.
				response.askedBeforeTool({
					phrases: ["price"],
					toolName: "previewAttach",
				}),
				tools.called({
					toolNames: ["listCustomers", "listPlans", "listEntities"],
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
					phrases: ["Juniper Labs", "Enterprise", "$36,000"],
				}),
			],
		},
	],
});
