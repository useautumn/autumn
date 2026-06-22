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

const experimentName = "update-subscription-add-feature";

// Customer already on Enterprise (a base-price plan); the ask is to add a
// boolean feature to that subscription, not re-attach the plan.
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers, plans }) => ({
		account: customers.withPlan({
			email: "billing+kp-customer-0999@redwood-systems.example",
			id: "kp-customer-0999",
			name: "Redwood Systems",
			plan: plans.enterprise,
		}),
	}),
});

const customer = setup.refs.customers.account;
const enterprisePlan = setup.refs.plans.enterprise;
const unlimitedSeats = setup.refs.features.unlimited_seats;

const expectedUpdateRequest = {
	customer_id: customer.id,
	plan_id: enterprisePlan.id,
	customize: {
		add_items: [
			{
				feature_id: unlimitedSeats.id,
				unlimited: true,
			},
		],
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
			name: "add boolean feature to existing enterprise subscription",
			conversation: [
				user({
					message:
						"i'd like to add the unlimited seats feature to kp-customer-0999, can u help?",
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
				api.calledAfterApproval({
					call: {
						body: expectedUpdateRequest,
						toolName: "updateSubscription",
					},
				}),
				response.mentions({
					phrases: ["kp-customer-0999", "Enterprise", "Unlimited Seats"],
				}),
			],
		},
	],
});
