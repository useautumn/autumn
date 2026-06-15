// Checkout-session variant of a sales-led upgrade: invoice mode is the default
// for provisioning, but when the user explicitly asks for a checkout link the
// attach must drop invoice_mode, force redirect_mode "always" so a URL comes
// back, and still enable the plan immediately while payment is pending.
import { withCustomers } from "../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../fixtures/expectations/index.js";
import { orgSetups } from "../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "trial-checkout-link";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers, plans }) => ({
		lumio: customers.withPlan({
			email: "billing@lumiolabs.example",
			id: "lumio-labs",
			name: "Lumio Labs",
			plan: plans.trial,
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.lumio,
			feature: features.workspaces,
			id: "lumio-labs-main",
			name: "Main",
		}),
	}),
});

const expectedAttachRequest = {
	customer_id: setup.refs.customers.lumio.id,
	enable_plan_immediately: true,
	entity_id: setup.refs.entities.workspace.id,
	plan_id: setup.refs.plans.scaleYearly.id,
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
			name: "checkout link upgrade keeps plan active and skips invoice mode",
			conversation: [
				user({
					message:
						"Lumio Labs signed an annual Scale agreement — they're on the trial plan right now. Send me a checkout link I can forward to them for payment. Customer id lumio-labs, workspace lumio-labs-main.",
				}),
				user({ message: "Looks good — create it." }),
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
				api.bodyExcludes({
					fields: ["invoice_mode"],
					toolName: "previewAttach",
				}),
				api.bodyExcludes({ fields: ["invoice_mode"], toolName: "attach" }),
				response.mentions({
					phrases: [
						"Lumio Labs",
						"Scale",
						"checkout.example.com/cs_lumio-labs",
					],
				}),
			],
		},
	],
});
