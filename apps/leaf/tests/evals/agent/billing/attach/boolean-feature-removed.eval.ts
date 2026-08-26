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

const experimentName = "attach-boolean-feature-removed";
const customPrice = 2000;

// approval_chains is a boolean on Scale, so withholding it is a removal.
const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		account: customers.base({
			email: "billing+kp-customer-0071@alder-systems.example",
			id: "kp-customer-0071",
			name: "Alder Systems",
		}),
	}),
});

const customer = setup.refs.customers.account;
const scalePlan = setup.refs.plans.scale;
const approvalChains = setup.refs.features.approval_chains;

const expectedAttachRequest = {
	customer_id: customer.id,
	customize: {
		price: {
			amount: customPrice,
			interval: "month",
		},
		remove_items: [{ feature_id: approvalChains.id }],
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
			name: "withhold a boolean feature by removing it, not zeroing it",
			conversation: [
				user({
					message:
						"attach scale at 2k/mo with no approval chains to kp-customer-0071",
				}),
				approve(),
			],
			expect: [
				tools.called({ toolNames: ["previewAttach", "attach"] }),
				...billing.previewThenWrite({
					body: expectedAttachRequest,
					write: "attach",
				}),
				// Both wrong shapes read as "removed" but provision the opposite.
				api.bodyExcludes({
					fields: ["feature_quantities", "customize.add_items"],
					toolName: "previewAttach",
				}),
				api.bodyExcludes({
					fields: ["feature_quantities", "customize.add_items"],
					toolName: "attach",
				}),
				response.mentions({ phrases: ["Scale", "$2,000"] }),
			],
		},
	],
});
