import { agentRules } from "../../../fixtures/agentRules/index.js";
import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	approvals,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "multiWrite";
};

const experimentName = "billing-multi-write-chained-approvals";

// Two customers already on Launch so a plan change is an update, and two more
// with no plan so an attach is the only sensible write. Customer-level billing:
// entity rules would rightly make the agent stop and ask which workspace.
const setup = withCustomers({
	setup: { ...orgSetups.knowledgePlatform(), agentRules: agentRules.base() },
	customers: ({ customers, plans }) => ({
		acme: customers.base({
			email: "billing+kp-customer-0100@acme-labs.example",
			id: "kp-customer-0100",
			name: "Acme Labs",
		}),
		beacon: customers.base({
			email: "billing+kp-customer-0101@beacon.example",
			id: "kp-customer-0101",
			name: "Beacon",
		}),
		redwood: customers.withPlan({
			email: "billing+kp-customer-0102@redwood.example",
			id: "kp-customer-0102",
			name: "Redwood Systems",
			plan: plans.launch,
		}),
		summit: customers.withPlan({
			email: "billing+kp-customer-0103@summit.example",
			id: "kp-customer-0103",
			name: "Summit Group",
			plan: plans.launch,
		}),
	}),
});

const { acme, beacon, redwood, summit } = setup.refs.customers;
const scalePlan = setup.refs.plans.scale;
const automationPack = setup.refs.plans.automationPack;

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: { domain: "billing", flow: "multiWrite" },
	timeout: 600_000,
	cases: [
		{
			// The customer write must land before the billing preview, or the user
			// approves a preview computed against the stale email.
			name: "change email then attach a plan",
			conversation: [
				user({
					message: `Update ${acme.name}'s email to finance@acme-labs.example, then put them on the monthly Scale plan with the included 1,000 credits.`,
					maxSteps: 20,
				}),
				approve({ optional: false }),
				approve({ optional: false }),
			],
			expect: [
				approvals.count({ count: 2 }),
				tools.called({ toolNames: ["updateCustomer", "attach"] }),
				api.calledInOrder({
					calls: [
						{
							body: {
								customer_id: acme.id,
								email: "finance@acme-labs.example",
							},
							toolName: "updateCustomer",
						},
						{
							body: { customer_id: acme.id, plan_id: scalePlan.id },
							toolName: "attach",
						},
					],
				}),
				api.calledAfterApproval({
					approvalIndex: 2,
					call: {
						body: { customer_id: acme.id, plan_id: scalePlan.id },
						toolName: "attach",
					},
				}),
			],
		},
		{
			// Homogeneous fan-out: same plan, two customers, one gate per write.
			name: "attach one plan to several customers",
			conversation: [
				user({
					message: `Put both ${acme.name} and ${beacon.name} on the monthly Scale plan with the included 1,000 credits.`,
					maxSteps: 20,
				}),
				approve({ optional: false }),
				approve({ optional: false }),
			],
			expect: [
				approvals.count({ count: 2 }),
				api.calledTimes({ call: { toolName: "attach" }, count: 2 }),
				api.called({
					calls: [
						{
							body: { customer_id: acme.id, plan_id: scalePlan.id },
							toolName: "attach",
						},
						{
							body: { customer_id: beacon.id, plan_id: scalePlan.id },
							toolName: "attach",
						},
					],
				}),
			],
		},
		{
			// Heterogeneous writes on one customer: an add-on attach and an update
			// to the base subscription cannot collapse into one call.
			name: "attach a plan and update another on the same customer",
			conversation: [
				user({
					message: `Add the Automation Pack add-on to ${redwood.name}, and cancel their Launch plan at the end of the cycle.`,
					maxSteps: 20,
				}),
				approve({ optional: false }),
				approve({ optional: false }),
			],
			expect: [
				approvals.count({ count: 2 }),
				tools.called({ toolNames: ["attach", "updateSubscription"] }),
				api.called({
					calls: [
						{
							body: { customer_id: redwood.id, plan_id: automationPack.id },
							toolName: "attach",
						},
						{
							body: { customer_id: redwood.id },
							toolName: "updateSubscription",
						},
					],
				}),
			],
		},
		{
			name: "attach for one customer and update another customer's plan",
			conversation: [
				user({
					message: `Put ${beacon.name} on the monthly Scale plan with the included 1,000 credits, and cancel ${summit.name}'s Launch plan at the end of the cycle.`,
					maxSteps: 20,
				}),
				approve({ optional: false }),
				approve({ optional: false }),
			],
			expect: [
				approvals.count({ count: 2 }),
				api.called({
					calls: [
						{
							body: { customer_id: beacon.id, plan_id: scalePlan.id },
							toolName: "attach",
						},
						{
							body: { customer_id: summit.id },
							toolName: "updateSubscription",
						},
					],
				}),
				response.mentions({ phrases: ["Beacon", "Summit Group"] }),
			],
		},
	],
});
