import { withCustomers } from "../../fixtures/createSetup.js";
import {
	api,
	approvals,
	response,
	tools,
} from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../harness/index.js";

type EvalMetadata = {
	domain: "customers";
	flow: "updateEmail";
};

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		acme: customers.base({
			email: "old@acme-labs.example",
			id: "cus_acme",
			name: "Acme Labs",
		}),
	}),
});

const acme = setup.refs.customers.acme;
const newEmail = "finance@acme-labs.example";

initEval<EvalMetadata>({
	experimentName: "customers-update-email",
	setup,
	metadata: { domain: "customers", flow: "updateEmail" },
	cases: [
		{
			name: "updates the email after a single approval",
			conversation: [
				user({ message: `Change ${acme.name}'s email to ${newEmail}.` }),
				approve({ optional: false }),
			],
			expect: [
				approvals.count({ count: 1 }),
				api.calledAfterApproval({
					call: {
						body: { customer_id: acme.id, email: newEmail },
						toolName: "updateCustomer",
					},
				}),
				api.calledTimes({
					call: { toolName: "updateCustomer" },
					count: 1,
				}),
			],
		},
		{
			name: "answers a read-only question without writing",
			conversation: [user({ message: `What email is ${acme.name} on?` })],
			expect: [
				approvals.count({ count: 0 }),
				api.calledTimes({ call: { toolName: "updateCustomer" }, count: 0 }),
				response.mentions({ phrases: ["old@acme-labs.example"] }),
			],
		},
		{
			name: "does not write when the customer does not exist",
			conversation: [
				user({ message: `Change Nonexistent Co's email to ${newEmail}.` }),
			],
			expect: [
				api.calledTimes({ call: { toolName: "updateCustomer" }, count: 0 }),
				api.calledTimes({
					call: { toolName: "getOrCreateCustomer" },
					count: 0,
				}),
				tools.called({ toolNames: ["listCustomers"] }),
			],
		},
	],
});
