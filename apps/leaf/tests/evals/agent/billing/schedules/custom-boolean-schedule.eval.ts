import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import {
	approve,
	contractAttachment,
	initEval,
	user,
} from "../../../harness/index.js";
import { billingScheduleScores } from "../../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "schedule";
};

const experimentName = "custom-boolean-schedule";
const now = new Date("2027-04-01T00:00:00.000Z");
const time = (value: string) => new Date(value).getTime();

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

const enterprisePhase = ({
	amount,
	startsAt,
}: {
	amount: number;
	startsAt: number;
}) => ({
	starts_at: startsAt,
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
	phases: [
		enterprisePhase({ amount: 7_500, startsAt: now.getTime() }),
		enterprisePhase({
			amount: 20_000,
			startsAt: time("2028-04-01T00:00:00.000Z"),
		}),
	],
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "schedule",
	},
	scores: billingScheduleScores(),
	today: now,
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
				billing.previewBeforeWrite({
					preview: {
						body: expectedScheduleRequest,
						toolName: "previewCreateSchedule",
					},
					write: {
						body: expectedScheduleRequest,
						toolName: "createSchedule",
					},
				}),
				api.calledAfterApproval({
					call: {
						body: expectedScheduleRequest,
						toolName: "createSchedule",
					},
				}),
				api.bodyNumberFields({
					paths: ["phases.*.starts_at"],
					toolName: "previewCreateSchedule",
				}),
				api.bodyNumberFields({
					paths: ["phases.*.starts_at"],
					toolName: "createSchedule",
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
