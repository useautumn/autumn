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

const experimentName = "attach-new-customer";

const setup = orgSetups.knowledgePlatform();
const customerId = "cus_attach_new_customer";
const customerEmail = "billing@cobalt.example";
const entityId = "workspace_cobalt";
const entityName = "Cobalt Workspace";
const scalePlan = setup.refs.plans.scale;
const entityFeature = setup.refs.features.workspaces;

const expectedCreateRequest = {
	customer_id: customerId,
	email: customerEmail,
};

const expectedCreateEntityRequest = {
	customer_id: customerId,
	entity_id: entityId,
	feature_id: entityFeature.id,
	name: entityName,
};

const expectedAttachRequest = {
	customer_id: customerId,
	enable_plan_immediately: true,
	entity_id: entityId,
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
			name: "create missing customer and entity before attach",
			conversation: [
				user({
					message:
						"Please attach the Scale plan to a new customer that is not in Autumn yet.",
				}),
				user({
					message:
						"Use customer id cus_attach_new_customer, email billing@cobalt.example, entity id workspace_cobalt, and entity name Cobalt Workspace.",
				}),
				user({ message: "Looks good, attach it." }),
				approve(),
			],
			expect: [
				response.askedBeforeTool({
					phrases: ["customer", "id", "email", "entity", "name"],
					notPhrases: ["deployment"],
					toolName: "getOrCreateCustomer",
				}),
				tools.called({
					toolNames: [
						"getAgentRules",
						"listPlans",
						"getOrCreateCustomer",
						"createEntity",
						"previewAttach",
						"attach",
					],
				}),
				api.calledInOrder({
					calls: [
						{
							body: expectedCreateRequest,
							toolName: "getOrCreateCustomer",
						},
						{
							body: expectedCreateEntityRequest,
							toolName: "createEntity",
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
				api.bodyExcludes({
					fields: ["entity_data"],
					toolName: "previewAttach",
				}),
				api.bodyExcludes({
					fields: ["entity_data"],
					toolName: "attach",
				}),
				response.mentions({
					phrases: [entityName, customerId, "Scale"],
				}),
			],
		},
	],
});
