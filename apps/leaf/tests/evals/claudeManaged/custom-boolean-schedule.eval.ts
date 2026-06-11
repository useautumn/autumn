// Claude-managed harness suite: recreation of agent/billing/schedules/custom-boolean-schedule.
// The harness runs in real time (the CLI injects the actual date), and the contract's term
// "begins when Provider provisions the Service" — so phase start times are asserted as
// numeric epoch ms via bodyNumberFields rather than pinned to a synthetic `today`.
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { withCustomers } from "../fixtures/createSetup.js";
import { billing, response, tools } from "../fixtures/expectations/index.js";
import { orgSetups } from "../fixtures/orgSetups.js";
import {
	approve,
	contractAttachment,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "schedule";
};

const experimentName = "boolean-schedule";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		northstar: customers.base({
			email: "ap@northstarlabs.example",
			id: "northstar-labs",
			name: "Northstar Labs, Inc.",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.northstar,
			feature: features.workspaces,
			id: "northstar-labs-production",
			name: "Production",
		}),
	}),
});

const enterpriseCustomize = (amount: number) => ({
	price: { amount, interval: BillingInterval.Year },
	remove_items: [{ feature_id: setup.refs.features.revision_history.id }],
	add_items: [
		{
			feature_id: setup.refs.features.hosted_solution.id,
			unlimited: true,
		},
		{
			feature_id: setup.refs.features.unlimited_seats.id,
			unlimited: true,
		},
	],
});

// Phase start times are real-time (provisioning day / +1 year), so they are
// asserted separately as numbers instead of exact values here.
const enterprisePhase = (amount: number) => ({
	plans: [
		{
			plan_id: setup.refs.plans.enterprise.id,
			customize: enterpriseCustomize(amount),
		},
	],
});

const expectedScheduleRequest = {
	customer_id: setup.refs.customers.northstar.id,
	enable_plan_immediately: true,
	entity_id: setup.refs.entities.workspace.id,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
		net_terms_days: 30,
	},
	redirect_mode: "if_required",
	phases: [enterprisePhase(7_500), enterprisePhase(20_000)],
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	// Real CMA via the ngrok-tunneled mock MCP — prod-parity harness.
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "schedule",
	},
	timeout: 150_000,
	cases: [
		{
			name: "slack pdf contract to custom enterprise schedule",
			conversation: [
				user({
					attachments: [
						contractAttachment({ fixtureId: "custom-booleans-schedule" }),
					],
					message:
						"I uploaded the signed order form for Northstar Labs. Please provision it in Autumn.",
				}),
				user({
					message:
						"Use customer_id northstar-labs and entity_id northstar-labs-production.",
				}),
				user({ message: "Looks good. Create the schedule." }),
				approve({ optional: false }),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listPlans",
						"listFeatures",
						"previewCreateSchedule",
						"createSchedule",
					],
				}),
				...billing.previewThenWrite({
					body: expectedScheduleRequest,
					numberFields: ["phases.*.starts_at"],
					write: "createSchedule",
				}),
				response.mentions({
					phrases: [
						"Northstar Labs",
						"Enterprise",
						"Hosted Solution",
						"Unlimited Seats",
					],
				}),
			],
		},
	],
});
