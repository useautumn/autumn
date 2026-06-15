// Sales-led checkout: the user asks to attach Scale and hand back a checkout
// session URL. The attach must force redirect_mode "always" so a checkout URL is
// returned (and skip invoice mode); the plan activates once the customer pays.
import { withCustomers } from "../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "checkout-session";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		atlas: customers.base({
			email: "billing@atlasrobotics.example",
			id: "kp-customer-0003",
			name: "Atlas Robotics",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.atlas,
			feature: features.workspaces,
			id: "kp-customer-0003-main",
			name: "Main",
		}),
	}),
});

const expectedAttachRequest = {
	customer_id: setup.refs.customers.atlas.id,
	entity_id: setup.refs.entities.workspace.id,
	plan_id: setup.refs.plans.scale.id,
	redirect_mode: "always",
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	timeout: 120_000,
	cases: [
		{
			name: "attach Scale and return a checkout session URL",
			conversation: [
				user({
					message:
						"attach the Scale plan to kp-customer-0003. And generate a checkout session URL",
				}),
				user({ message: "Looks good, go ahead." }),
				approve({ optional: false }),
			],
			expect: [
				tools.called({
					toolNames: ["getAgentRules", "listPlans", "previewAttach", "attach"],
				}),
				...billing.previewThenWrite({
					body: expectedAttachRequest,
					write: "attach",
				}),
				api.bodyExcludes({ fields: ["invoice_mode"], toolName: "attach" }),
				response.mentions({
					phrases: ["Scale", "checkout.example.com/cs_kp-customer-0003"],
				}),
			],
		},
	],
});
