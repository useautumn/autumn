import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../../harness/index.js";
import { billingUpdateSubscriptionScores } from "../../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "updateSubscription";
};

const experimentName = "update-subscription-remove-item";

// Customer on Scale (expanded features + seats + credits). Removing one feature
// must be PATCH-style (remove_items) — a PUT-style `customize.items` would wipe
// their seat and credit balances.
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers, plans }) => ({
		account: customers.withPlan({
			email: "billing+kp-customer-0042@cedar-systems.example",
			id: "kp-customer-0042",
			name: "Cedar Systems",
			plan: plans.scale,
		}),
	}),
});

const customer = setup.refs.customers.account;
const scalePlan = setup.refs.plans.scale;
const revisionHistory = setup.refs.features.revision_history;

const expectedUpdateRequest = {
	customer_id: customer.id,
	plan_id: scalePlan.id,
	customize: {
		remove_items: [{ feature_id: revisionHistory.id }],
	},
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "updateSubscription",
	},
	scores: billingUpdateSubscriptionScores(),
	cases: [
		{
			name: "remove boolean feature without overwriting balances",
			conversation: [
				user({
					message:
						"please remove the revision history feature from kp-customer-0042's plan",
				}),
				user({ message: "Looks good, go ahead." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: ["listCustomers", "listPlans", "listFeatures"],
				}),
				billing.previewBeforeWrite({
					preview: {
						body: expectedUpdateRequest,
						toolName: "previewUpdateSubscription",
					},
					write: {
						body: expectedUpdateRequest,
						toolName: "updateSubscription",
					},
				}),
				// PATCH-style only: a full `customize.items` replacement would drop the
				// customer's seats and credit balances.
				api.bodyExcludes({
					fields: ["customize.items"],
					toolName: "previewUpdateSubscription",
				}),
				api.bodyExcludes({
					fields: ["customize.items"],
					toolName: "updateSubscription",
				}),
				api.calledAfterApproval({
					call: {
						body: expectedUpdateRequest,
						toolName: "updateSubscription",
					},
				}),
				response.mentions({
					phrases: ["kp-customer-0042", "Scale", "Revision History"],
				}),
			],
		},
	],
});
