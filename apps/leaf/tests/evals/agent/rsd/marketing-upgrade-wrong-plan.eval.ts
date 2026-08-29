import { api, billing, tools } from "../../fixtures/expectations/index.js";
import { approve, initEval, user } from "../../harness/index.js";
import { billingAttachScores } from "../../utils/scorers.js";
import { incidentSetup } from "./incidentSetup.js";

type EvalMetadata = {
	domain: "rsd";
	flow: "attach";
};

const experimentName = "rsd-marketing-upgrade-wrong-plan";

// Replays a live incident: "upgrade their marketing product to 700K contacts
// for $1900/mo" for a customer on custom Enterprise + transactional. The
// failure was an updateSubscription on Enterprise (wrong product, prorations
// dropped) instead of a customized Marketing attach.
const setup = incidentSetup();

const customer = setup.refs.customers.sender;

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
			name: "a marketing upgrade attaches a marketing plan, never the enterprise subscription",
			conversation: [
				user({
					message: `For customer ID: ${customer.id}, can we please upgrade their account to 700K contacts for $1900/month. This would just be for their marketing product`,
				}),
				user({
					message: "can you confirm the total number of contacts and pricing",
				}),
				approve(),
			],
			expect: [
				tools.called({ toolNames: ["previewAttach", "attach"] }),
				...billing.previewThenWrite({
					body: {
						customer_id: customer.id,
						customize: {
							price: { amount: 1900, interval: "month" },
						},
					},
					write: "attach",
				}),
				api.calledTimes({
					call: { toolName: "updateSubscription" },
					count: 0,
				}),
			],
		},
	],
});
