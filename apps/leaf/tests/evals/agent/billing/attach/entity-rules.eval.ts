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

const experimentName = "attach-entity-rules";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing@alder.example",
			id: "cus_attach_entity_rules",
			name: "Alder Systems",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspaceAlpha: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_alpha",
			name: "Workspace Alpha",
		}),
		workspaceBeta: entities.base({
			customer: customers.account,
			feature: features.workspaces,
			id: "workspace_beta",
			name: "Workspace Beta",
		}),
	}),
});
const customer = setup.refs.customers.account;
const scalePlan = setup.refs.plans.scale;
const workspace = setup.refs.entities.workspaceAlpha;

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
			name: "entity attach rules require entity selection before preview",
			conversation: [
				user({
					message: "Please attach the Scale plan to Alder Systems.",
				}),
				user({ message: "Use Workspace Alpha." }),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listCustomers",
						"listPlans",
						"listEntities",
						"previewAttach",
						"attach",
					],
				}),
				api.calledInOrder({
					calls: [
						{
							body: { customer_id: customer.id },
							toolName: "listEntities",
						},
						{
							body: expectedAttachRequest,
							toolName: "previewAttach",
						},
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
					phrases: [
						"Workspace Alpha",
						"Workspace Beta",
						"Alder Systems",
						"Scale",
					],
				}),
			],
		},
	],
});
