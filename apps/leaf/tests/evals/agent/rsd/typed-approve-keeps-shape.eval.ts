import { api, tools } from "../../fixtures/expectations/index.js";
import { initEval, user } from "../../harness/index.js";
import { billingAttachScores } from "../../utils/scorers.js";
import { incidentSetup } from "./incidentSetup.js";

type EvalMetadata = {
	domain: "rsd";
	flow: "attach";
};

const experimentName = "rsd-typed-approve-keeps-shape";

const setup = incidentSetup();

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
			name: "a typed approve executes the previewed write, not a rebuilt one",
			conversation: [
				user({
					message: `Attach ${marketing.id} customized to $1900/month with 700K contacts for customer ${customer.id}, prorated with a finalized invoice.`,
				}),
				user({ message: "please approve" }),
			],
			expect: [
				tools.called({ toolNames: ["previewAttach"] }),
				api.calledTimes({
					call: {
						body: {
							customer_id: customer.id,
							customize: {
								price: { amount: 1900, interval: "month" },
							},
							plan_id: marketing.id,
						},
						toolName: "previewAttach",
					},
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
