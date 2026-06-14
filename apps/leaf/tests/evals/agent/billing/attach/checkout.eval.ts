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

const experimentName = "attach-checkout-link";

// User explicitly wants a checkout link to send the customer: checkout mode
// omits invoice_mode and forces a payment URL with redirect_mode "always".
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@harbor.example",
			id: "cus_attach_checkout",
			name: "Harbor Group",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_harbor",
			name: "Harbor Workspace",
		}),
	}),
});

const customer = setup.refs.customers.account;
const scalePlan = setup.refs.plans.scale;
const workspace = setup.refs.entities.workspace;

const expectedAttachRequest = {
	customer_id: customer.id,
	enable_plan_immediately: true,
	entity_id: workspace.id,
	plan_id: scalePlan.id,
	redirect_mode: "always",
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
			name: "send a checkout link for the scale plan",
			conversation: [
				user({
					message:
						"Can you send Harbor Group a checkout link for the Scale plan on Harbor Workspace? They'll pay it themselves.",
				}),
				user({ message: "Looks good, create it." }),
				approve(),
			],
			expect: [
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
				// Checkout flow: no draft invoice should be created.
				api.bodyExcludes({
					fields: ["invoice_mode"],
					toolName: "previewAttach",
				}),
				api.bodyExcludes({
					fields: ["invoice_mode"],
					toolName: "attach",
				}),
				api.calledAfterApproval({
					call: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				response.mentions({
					phrases: ["Harbor Group", "Scale", "checkout"],
				}),
			],
		},
	],
});
