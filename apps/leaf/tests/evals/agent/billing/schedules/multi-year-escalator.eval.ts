import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { withCustomers } from "../../../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../../../fixtures/expectations/index.js";
import { orgSetups } from "../../../fixtures/orgSetups.js";
import { approve, initEval, user } from "../../../harness/index.js";
import { billingScheduleScores } from "../../../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "schedule";
};

const experimentName = "multi-year-escalator";
const now = new Date("2026-06-12T00:00:00.000Z");
const time = (value: string) => new Date(value).getTime();

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		twoYear: customers.base({
			email: "billing+kp-customer-0042@redwood-systems.example",
			id: "kp-customer-0042",
			name: "Redwood Systems",
		}),
		fourYear: customers.base({
			email: "billing+kp-customer-0117@harbor-data.example",
			id: "kp-customer-0117",
			name: "Harbor Data",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		redwoodWorkspace: entities.base({
			customer: customers.twoYear,
			feature: features.workspaces,
			id: "workspace_redwood",
			name: "Redwood Workspace",
		}),
		harborWorkspace: entities.base({
			customer: customers.fourYear,
			feature: features.workspaces,
			id: "workspace_harbor_data",
			name: "Harbor Data Workspace",
		}),
	}),
});

const enterprisePlan = setup.refs.plans.enterprise;

// Each phase escalates only the annual price; entitlements (credits, seats)
// stay constant, so the price bump must land in customize.price — never as a
// credit grant or a separate subscription.
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
			plan_id: enterprisePlan.id,
			customize: {
				price: { amount, interval: BillingInterval.Year },
			},
		},
	],
});

const twoYearSchedule = {
	customer_id: setup.refs.customers.twoYear.id,
	phases: [
		enterprisePhase({
			amount: 40_000,
			startsAt: time("2026-07-01T00:00:00.000Z"),
		}),
		enterprisePhase({
			amount: 50_000,
			startsAt: time("2027-07-01T00:00:00.000Z"),
		}),
	],
};

const fourYearSchedule = {
	customer_id: setup.refs.customers.fourYear.id,
	phases: [
		enterprisePhase({
			amount: 60_000,
			startsAt: time("2026-07-01T00:00:00.000Z"),
		}),
		enterprisePhase({
			amount: 72_000,
			startsAt: time("2027-07-01T00:00:00.000Z"),
		}),
		enterprisePhase({
			amount: 86_400,
			startsAt: time("2028-07-01T00:00:00.000Z"),
		}),
		enterprisePhase({
			amount: 103_680,
			startsAt: time("2029-07-01T00:00:00.000Z"),
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
	timeout: 90_000,
	cases: [
		{
			name: "two-year escalating schedule with constant credits",
			conversation: [
				user({
					message:
						"We signed a 2-year deal with kp-customer-0042 on Enterprise. Year 1 is $40k/year starting Jul 1 2026, renewing at $50k for year 2. Included credits stay at 50,000/month the whole time. Set up the billing schedule on the Redwood Workspace (entity workspace_redwood).",
				}),
				user({ message: "Looks good, create the schedule." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"listCustomers",
						"listPlans",
						"previewCreateSchedule",
						"createSchedule",
					],
				}),
				billing.previewBeforeWrite({
					preview: {
						body: twoYearSchedule,
						toolName: "previewCreateSchedule",
					},
					write: {
						body: twoYearSchedule,
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
				api.calledAfterApproval({
					call: {
						body: twoYearSchedule,
						toolName: "createSchedule",
					},
				}),
				response.mentions({
					phrases: ["kp-customer-0042", "Enterprise", "$40", "$50"],
				}),
			],
		},
		{
			name: "four-year 20% escalator with constant credits",
			conversation: [
				user({
					message:
						"kp-customer-0117 signed a 4-year Enterprise contract starting Jul 1 2026 at $60k/year, escalating 20% each year. Included credits stay flat at 100,000/month for all four years. Provision the schedule on the Harbor Data Workspace (entity workspace_harbor_data).",
				}),
				user({ message: "Looks good, create the schedule." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"listCustomers",
						"listPlans",
						"previewCreateSchedule",
						"createSchedule",
					],
				}),
				billing.previewBeforeWrite({
					preview: {
						body: fourYearSchedule,
						toolName: "previewCreateSchedule",
					},
					write: {
						body: fourYearSchedule,
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
				api.calledAfterApproval({
					call: {
						body: fourYearSchedule,
						toolName: "createSchedule",
					},
				}),
				response.mentions({
					phrases: ["kp-customer-0117", "Enterprise", "$60", "$103,680"],
				}),
			],
		},
	],
});
