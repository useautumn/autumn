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

const experimentName = "attach-included-credits";
const customIncludedCredits = 100_000;

// Scale has a base price, so the only customization is the included credit grant.
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@brightline.example",
			id: "cus_attach_included_credits",
			name: "Brightline Labs",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_brightline",
			name: "Brightline Workspace",
		}),
	}),
});

const customer = setup.refs.customers.account;
const scalePlan = setup.refs.plans.scale;
const workspace = setup.refs.entities.workspace;
const credits = setup.refs.features.credits;

const expectedAttachRequest = {
	customer_id: customer.id,
	enable_plan_immediately: true,
	entity_id: workspace.id,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
	},
	plan_id: scalePlan.id,
	customize: {
		add_items: [
			{
				feature_id: credits.id,
				included: customIncludedCredits,
			},
		],
	},
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
			name: "attach scale with custom included credits",
			conversation: [
				user({
					message:
						"Please attach the Scale plan to Brightline Labs for Brightline Workspace, but bump their included credits to 100,000 per month.",
				}),
				user({ message: "Looks good, attach it." }),
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
				api.calledAfterApproval({
					call: {
						body: expectedAttachRequest,
						toolName: "attach",
					},
				}),
				response.mentions({
					phrases: [
						"Brightline Labs",
						"Brightline Workspace",
						"Scale",
						"100,000",
					],
				}),
			],
		},
	],
});
