import {
	applyCustomizeToPlan,
	loosePlanItemMatchesFilter,
} from "@autumn/shared";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { isSameToolRequest } from "../../../../../src/internal/approvals/utils/toolRequest.js";
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
import {
	billingScheduleScores,
	type EvalScoreArgs,
} from "../../../utils/scorers.js";

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

// Both catalog credit slots are replaced, so each is removed by its billing
// method; the matcher compares removal filters as an unordered set.
const enterpriseCustomize = (amount: number) => ({
	price: { amount, interval: BillingInterval.Year },
	remove_items: [
		{ feature_id: setup.refs.features.revision_history.id },
		{ feature_id: setup.refs.features.credits.id, billing_method: "prepaid" },
		{
			feature_id: setup.refs.features.credits.id,
			billing_method: "usage_based",
		},
	],
	add_items: [
		{
			feature_id: setup.refs.features.hosted_solution.id,
			unlimited: true,
		},
		{
			feature_id: setup.refs.features.unlimited_seats.id,
			unlimited: true,
		},
		{
			feature_id: setup.refs.features.credits.id,
			included: 5_000,
			reset: { interval: "month" },
			price: {
				amount: 0.01,
				interval: BillingInterval.Month,
				billing_method: "usage_based",
			},
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

// Judges the executed schedule and the preview that vouched for it. A
// preview the verifier rejected before approval never became a write, so it
// is not part of the delivered package.
const contractPackageScore = ({ output }: EvalScoreArgs) => {
	const writes = output.apiCalls.filter(
		(call) => call.toolName === "createSchedule",
	);
	const withoutExpand = ({
		expand: _expand,
		...body
	}: Record<string, unknown>) => body;
	const previews = output.apiCalls.filter(
		(call) =>
			call.toolName === "previewCreateSchedule" &&
			writes.some((write) =>
				isSameToolRequest(withoutExpand(write.body), withoutExpand(call.body)),
			),
	);
	const calls = [...previews, ...writes];
	const complete =
		writes.length >= 1 &&
		previews.length >= 1 &&
		calls.every((call) => {
			const phases = call.body.phases as
				| Array<{
						plans: Array<{
							plan_id: string;
							customize: Parameters<
								typeof applyCustomizeToPlan
							>[0]["customize"];
						}>;
				  }>
				| undefined;
			return (
				phases?.length === 2 &&
				phases.every((phase) => {
					const enterprise = phase.plans.find(
						(plan) => plan.plan_id === setup.refs.plans.enterprise.id,
					);
					if (!enterprise) return false;
					const effective = applyCustomizeToPlan({
						plan: setup.refs.plans.enterprise,
						customize: enterprise.customize,
					});
					const hasItem = (filter: Record<string, unknown>) =>
						effective.items.some((item) =>
							loosePlanItemMatchesFilter({ item, filter }),
						);
					const credits = effective.items.filter(
						(item) => item.feature_id === setup.refs.features.credits.id,
					);
					return (
						hasItem({
							feature_id: setup.refs.features.member_slots.id,
							included: 25,
						}) &&
						hasItem({
							feature_id: setup.refs.features.project_slots.id,
							included: 100,
						}) &&
						credits.length === 1 &&
						credits[0]?.included === 5000 &&
						credits[0]?.reset?.interval === "month" &&
						credits[0]?.price?.amount === 0.01 &&
						credits[0]?.price?.billing_method === "usage_based" &&
						credits[0]?.price?.interval === "month" &&
						[
							"insight_reports",
							"automation_rules",
							"outbound_hooks",
							"platform_api",
							"approval_chains",
							"team_policies",
							"private_spaces",
							"export_center",
							"priority_queue",
							"brand_controls",
							"compliance_controls",
							"hosted_solution",
							"unlimited_seats",
						].every((feature_id) =>
							effective.items.some(
								(item) =>
									item.feature_id === feature_id && item.unlimited === true,
							),
						) &&
						!hasItem({ feature_id: setup.refs.features.revision_history.id })
					);
				})
			);
		});
	return { name: "contract_package_complete", score: complete ? 1 : 0 };
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "schedule",
	},
	scores: [...billingScheduleScores(), contractPackageScore],
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
