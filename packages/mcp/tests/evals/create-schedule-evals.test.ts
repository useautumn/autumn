import { expect, test } from "bun:test";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { parseISO } from "date-fns";
import {
	expectApiCall,
	expectExactApiCall,
	expectNoApiCall,
	expectNoToolCall,
	expectToolCall,
	initMcpEval,
	type ToolRequest,
	type ToolRequestInput,
} from "../utils/eval-test-utils.js";

const time = (value: string) => parseISO(value).getTime();
const expectCustomFeatures = (
	schedule: ToolRequestInput<"createSchedule">,
	featureIds: string[],
) => {
	const actualIds = schedule.phases.flatMap((phase) =>
		phase.plans.flatMap(
			(plan) => plan.customize?.items?.map((item) => item.feature_id) ?? [],
		),
	);
	for (const featureId of featureIds) {
		expect(actualIds.filter((id) => id === featureId)).toHaveLength(1);
	}
};

test("previews and confirms a plain-English create schedule request", async () => {
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listCustomers: {
				customers: [{ id: "cus_contract", name: "Contract Customer" }],
			},
			listPlans: {
				plans: [
					{ id: "pro", name: "Pro" },
					{ id: "addon", name: "Support Add-on" },
					{ id: "enterprise", name: "Enterprise" },
				],
			},
			previewCreateSchedule: {
				total: 40,
				subtotal: 40,
				line_items: [{ total: 20 }, { total: 20 }],
			},
			createSchedule: { status: "created", schedule_id: "sched_eval" },
		},
	});

	await generate([
		"Can you preview a schedule for cus_contract without creating it yet?",
		"Start them on the pro plan with the addon on January 1, 2024.",
		"Then move them to enterprise on February 1, 2024.",
	]);

	expectToolCall(toolCalls, "previewCreateSchedule", {
		customer_id: "cus_contract",
	});
	expectNoToolCall(toolCalls, "createSchedule");

	expectApiCall(api, "previewCreateSchedule", {
		customer_id: "cus_contract",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: 1704067200000,
				plans: [{ plan_id: "pro" }, { plan_id: "addon" }],
			},
			{
				starts_at: 1706745600000,
				plans: [{ plan_id: "enterprise" }],
			},
		],
	});
	expectNoApiCall(api, "createSchedule");

	await generate("Yes, create that schedule exactly as previewed.");

	expectToolCall(toolCalls, "createSchedule", {
		customer_id: "cus_contract",
	});
	expectApiCall(api, "createSchedule", {
		customer_id: "cus_contract",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: 1704067200000,
				plans: [{ plan_id: "pro" }, { plan_id: "addon" }],
			},
			{
				starts_at: 1706745600000,
				plans: [{ plan_id: "enterprise" }],
			},
		],
	});
}, 30000);

test("turns extracted contract text into the expected schedule preview and create call", async () => {
	const customFeatureIds = [
		"sso",
		"audit_logs",
		"data_residency",
		"premium_onboarding",
		"dedicated_success",
		"security_review",
	];
	const expectedSchedule = {
		customer_id: "cus_northstar_contract",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: time("2026-04-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "growth",
						customize: {
							items: [
								{ feature_id: "seats", included: 25 },
								{ feature_id: "api_calls", included: 100000 },
							],
						},
					},
					{
						plan_id: "implementation",
						customize: {
							price: { amount: 1500, interval: BillingInterval.OneOff },
						},
					},
				],
			},
			{
				starts_at: time("2026-07-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "growth",
						customize: {
							items: [
								{ feature_id: "seats", included: 40 },
								{ feature_id: "api_calls", included: 250000 },
							],
						},
					},
					{ plan_id: "priority_support" },
				],
			},
			{
				starts_at: time("2027-01-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "enterprise",
						customize: {
							price: { amount: 2400, interval: BillingInterval.Month },
							items: [
								{ feature_id: "seats", included: 75 },
								{ feature_id: "api_calls", included: 1000000 },
								{ feature_id: "sso", unlimited: true },
								{
									feature_id: "audit_logs",
									included: 365,
									reset: { interval: ResetInterval.Month },
								},
								{ feature_id: "data_residency", unlimited: true },
								{ feature_id: "premium_onboarding", included: 1 },
								{
									feature_id: "dedicated_success",
									included: 10,
									reset: { interval: ResetInterval.Month },
								},
								{
									feature_id: "security_review",
									included: 2,
									reset: { interval: ResetInterval.Year },
								},
							],
						},
					},
					{ plan_id: "priority_support" },
				],
			},
		],
	} satisfies ToolRequestInput<"createSchedule">;
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listCustomers: {
				customers: [
					{
						id: "cus_northstar_contract",
						name: "Northstar Labs",
						email: "billing@northstar.example",
					},
				],
			},
			listPlans: {
				plans: [
					{ id: "growth", name: "Growth" },
					{ id: "implementation", name: "Implementation" },
					{ id: "priority_support", name: "Priority Support" },
					{ id: "enterprise", name: "Enterprise" },
				],
			},
			previewCreateSchedule: {
				total: 1500,
				subtotal: 1500,
				line_items: [{ description: "Implementation", total: 1500 }],
			},
			createSchedule: { status: "created", schedule_id: "sched_northstar" },
		},
	});
	const extractedContractText = [
		"MASTER SERVICES AGREEMENT",
		"Order Form OF-2026-041 | Prepared for Northstar Labs Ltd.",
		"Effective date: March 12, 2026. Governing law: New York. Payment terms: Net 30. Notices should be sent to legal@northstar.example.",
		"Normalized schedule dates: April 1, 2026 is 2026-04-01; July 1, 2026 is 2026-07-01; January 1, 2027 is 2027-01-01.",
		"Extractor normalized starts_at values: phase 1 starts_at=1775001600000; phase 2 starts_at=1782864000000; phase 3 starts_at=1798761600000. Use these starts_at values verbatim.",
		"Billing contact: billing@northstar.example. Customer reference in Autumn should be resolved from this account name or billing contact before any schedule is prepared.",
		"Section 2. Initial ramp. On April 1, 2026, start the Growth plan with 25 seats and 100,000 API calls. Add the one-time Implementation plan at $1,500 for onboarding work.",
		"Section 3. Expansion. On July 1, 2026, keep Growth active, increase to 40 seats and 250,000 API calls, and add Priority Support.",
		"Section 4. Enterprise conversion. On January 1, 2027, move to Enterprise at a custom $2,400/month base rate with 75 seats and 1,000,000 API calls. Keep Priority Support.",
		"Enterprise conversion also includes contract-specific feature overrides that are not part of the standard Enterprise plan: unlimited sso, 365 audit_logs per month, unlimited data_residency, 1 premium_onboarding grant, 10 dedicated_success hours per month, and 2 security_review credits per year.",
		"Section 8. Confidentiality. Neither party may disclose pricing or implementation details except to auditors, investors, or legal advisors under confidentiality obligations.",
		"Section 11. Service levels. Support response targets are commercially reasonable and do not create service credits unless separately stated in an SLA exhibit.",
		"Signature block: Northstar Labs Ltd. / Autumn test vendor. This synthetic fixture contains no customer-confidential contract text.",
	].join("\n");

	await generate([
		"A PDF text extractor returned the contract text below.",
		"Use only this extracted text, look up the customer and plans in Autumn, then preview the schedule. Do not create it yet.",
		"For schedule phase dates, use the extractor normalized starts_at values verbatim.",
		"Represent every feature quantity from the extracted contract as plan customize.items with included/unlimited values. Do not use feature_quantities for this contract import.",
		"Contract-specific features named in the text are not part of the base plan; put them in the relevant plan customize.items override.",
		extractedContractText,
	]);

	expectToolCall(toolCalls, "listCustomers");
	expectToolCall(toolCalls, "listPlans");
	expectToolCall(toolCalls, "previewCreateSchedule", {
		customer_id: "cus_northstar_contract",
	});
	expectNoToolCall(toolCalls, "createSchedule");
	const previewCall = expectExactApiCall(
		api,
		"previewCreateSchedule",
		expectedSchedule,
	);
	expectCustomFeatures(previewCall?.rawBody, customFeatureIds);
	expectNoApiCall(api, "createSchedule");

	await generate("Confirmed. Create the schedule exactly as previewed.");

	expectToolCall(toolCalls, "createSchedule", {
		customer_id: "cus_northstar_contract",
	});
	const createCall = expectExactApiCall(api, "createSchedule", expectedSchedule);
	expectCustomFeatures(createCall?.rawBody, customFeatureIds);
}, 45000);
