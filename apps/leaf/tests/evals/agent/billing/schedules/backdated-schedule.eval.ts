import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
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

const experimentName = "backdated-schedule";
const time = (value: string) => new Date(value).getTime();

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		northstar: customers.base({
			email: "billing@northstar.example",
			id: "cus_northstar_contract",
			name: "Northstar Labs",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.northstar,
			feature: features.workspaces,
			id: "workspace_northstar_platform",
			name: "Northstar Platform Workspace",
		}),
	}),
});

const expectedScheduleRequest = {
	customer_id: setup.refs.customers.northstar.id,
	enable_plan_immediately: true,
	entity_id: setup.refs.entities.workspace.id,
	invoice_mode: {
		enable_plan_immediately: true,
		enabled: true,
		finalize: false,
	},
	redirect_mode: "if_required",
	phases: [
		{
			starts_at: time("2027-04-01T00:00:00.000Z"),
			plans: [
				{
					plan_id: setup.refs.plans.launch.id,
					customize: {
						items: [
							{ feature_id: "member_slots", included: 25 },
							{
								feature_id: "credits",
								included: 100_000,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
				{
					plan_id: setup.refs.plans.automationPack.id,
				},
			],
		},
		{
			starts_at: time("2027-07-01T00:00:00.000Z"),
			plans: [
				{
					plan_id: setup.refs.plans.scale.id,
					customize: {
						items: [
							{ feature_id: "member_slots", included: 40 },
							{
								feature_id: "credits",
								included: 250_000,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
				{ plan_id: setup.refs.plans.automationPack.id },
				{ plan_id: setup.refs.plans.securityPack.id },
			],
		},
		{
			starts_at: time("2028-01-01T00:00:00.000Z"),
			plans: [
				{
					plan_id: setup.refs.plans.enterprise.id,
					customize: {
						price: { amount: 2_400, interval: BillingInterval.Month },
						items: [
							{ feature_id: "member_slots", included: 75 },
							{ feature_id: "project_slots", included: 500 },
							{
								feature_id: "credits",
								included: 1_000_000,
								reset: { interval: ResetInterval.Month },
							},
							{ feature_id: "platform_api", unlimited: true },
							{ feature_id: "approval_chains", unlimited: true },
							{ feature_id: "compliance_controls", unlimited: true },
							{ feature_id: "brand_controls", unlimited: true },
						],
					},
				},
				{ plan_id: setup.refs.plans.securityPack.id },
				{ plan_id: setup.refs.plans.whiteLabelPack.id },
			],
		},
	],
};

const extractedContractText = [
	"MASTER SERVICES AGREEMENT",
	"Order Form OF-2027-041 | Prepared for Northstar Labs Ltd.",
	"Effective date: March 12, 2027. Governing law: New York. Payment terms: Net 30. Notices should be sent to legal@northstar.example.",
	"Extracted service dates: initial ramp starts 2027-04-01; expansion starts 2027-07-01; enterprise conversion starts 2028-01-01.",
	"Autumn entity scope: Northstar Platform Workspace.",
	"Billing contact: billing@northstar.example. Customer reference in Autumn should be resolved from this account name or billing contact before any schedule is prepared.",
	"This is a backdated schedule: today's eval date is 2027-04-15, but the contract start date is 2027-04-01. Preserve the exact April 1, 2027 start date; do not use now for the first phase.",
	"Section 2. Initial ramp. On April 1, 2027, start the Launch plan with 25 member slots and 100,000 credits per month. Add the Automation Pack.",
	"Section 3. Expansion. On July 1, 2027, move to Scale, increase to 40 member slots and 250,000 credits per month, and keep Automation Pack. Add Security Pack.",
	"Section 4. Enterprise conversion. On January 1, 2028, move to Enterprise at a custom $2,400/month base rate with 75 member slots, 500 project slots, and 1,000,000 credits per month. Keep Security Pack and add White Label Pack.",
	"Enterprise conversion also includes contract-specific feature overrides that are not part of the standard Enterprise plan: unlimited API access, unlimited approval flows, unlimited compliance cntrls, and unlimited brand controls.",
	"Section 8. Confidentiality. Neither party may disclose pricing or implementation details except to auditors, investors, or legal advisors under confidentiality obligations.",
	"Section 11. Service levels. Support response targets are commercially reasonable and do not create service credits unless separately stated in an SLA exhibit.",
	"Signature block: Northstar Labs Ltd. / Autumn Software Inc.",
].join("\n");

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "schedule",
	},
	scores: billingScheduleScores(),
	today: new Date("2027-04-15T00:00:00.000Z"),
	timeout: 75_000,
	cases: [
		{
			name: "contract text to backdated schedule",
			conversation: [
				user({
					message: [
						"A PDF text extractor returned the contract text below.",
						"Please handle this in Autumn using only the extracted text.",
						"This is a backdated schedule; preserve the contract's original phase dates exactly.",
						"Make sure all feature limits and overrides from the contract are reflected in the schedule.",
						"Apply the contract-specific feature overrides to the Enterprise phase.",
						extractedContractText,
					].join("\n"),
				}),
				user({ message: "Looks good, create the schedule." }),
				approve(),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listCustomers",
						"listEntities",
						"listPlans",
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
				api.calledInOrder({
					calls: [
						{
							body: { customer_id: setup.refs.customers.northstar.id },
							toolName: "listEntities",
						},
						{
							body: expectedScheduleRequest,
							toolName: "previewCreateSchedule",
						},
					],
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
						"cus_northstar_contract",
						"workspace_northstar_platform",
						"Launch",
						"Scale",
						"Enterprise",
					],
				}),
			],
		},
	],
});
