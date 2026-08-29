import { BillingInterval } from "@autumn/shared";
import { withCustomers } from "../../fixtures/createSetup.js";
import { api, tools } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import { plan } from "../../fixtures/plans/index.js";
import { approve, initEval, user } from "../../harness/index.js";
import { billingAttachScores } from "../../utils/scorers.js";

type EvalMetadata = {
	domain: "rsd";
	flow: "attach";
};

const experimentName = "rsd-question-keeps-pending-write";

// Replays the incident's card churn: every clarifying reply superseded the
// pending card with a fresh write. A question must be answered in text while
// exactly one previewed write survives to approval.
const setup = withCustomers({
	setup: orgSetups.emailPlatform(),
	customers: ({ customers, plans, subscriptions }) => ({
		sender: {
			...customers.base({
				email: "billing@corvid-interactive.example",
				id: "rsd-customer-0001",
				name: "Corvid Interactive",
			}),
			subscriptions: [
				subscriptions.active({
					plan: plan.customized({
						customize: {
							price: { amount: 720, interval: BillingInterval.Month },
						},
						plan: plans.enterprise,
					}),
				}),
				subscriptions.active({ plan: plans.sendhubPro }),
			],
		},
	}),
});

const customer = setup.refs.customers.sender;
const marketing = setup.refs.plans.marketingStarter150k;

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "rsd",
		flow: "attach",
	},
	scores: billingAttachScores(),
	cases: [
		{
			name: "a pricing question is answered in text without replacing the write",
			conversation: [
				user({
					message: `Attach ${marketing.id} customized to $1900/month with 700K contacts for customer ${customer.id}, prorated with a finalized invoice.`,
				}),
				user({
					message: "can you confirm the total number of contacts and pricing",
				}),
				approve(),
			],
			expect: [
				tools.called({ toolNames: ["previewAttach", "attach"] }),
				api.calledTimes({
					call: { toolName: "previewAttach" },
					count: 1,
				}),
				api.calledTimes({
					call: { toolName: "attach" },
					count: 1,
				}),
				api.calledTimes({
					call: { toolName: "updateSubscription" },
					count: 0,
				}),
				api.calledTimes({
					call: { toolName: "previewUpdateSubscription" },
					count: 0,
				}),
			],
		},
	],
});
