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
	const { api, approve, generate, toolCalls } = initMcpEval({
		today: parseISO("2026-06-01T00:00:00.000Z"),
		fixtures: {
			listCustomers: {
				list: [{ id: "cus_contract", name: "Contract Customer" }],
			},
			getCustomer: { id: "cus_contract", name: "Contract Customer" },
			listPlans: {
				list: [
					{ id: "pro", name: "Pro" },
					{ id: "addon", name: "Support Add-on" },
					{ id: "enterprise", name: "Enterprise" },
				],
			},
			getPlan: (body: ToolRequest<"getPlan">) => ({
				id: body.plan_id,
				name: body.plan_id,
			}),
			previewCreateSchedule: {
				total: 40,
				subtotal: 40,
				line_items: [{ total: 20 }, { total: 20 }],
			},
			createSchedule: { status: "created", schedule_id: "sched_eval" },
		},
	});

	await generate([
		"Can you set up a schedule for cus_contract?",
		"Start them on the pro plan with the addon on 2027-01-01.",
		"Then move them to enterprise on 2027-02-01.",
	]);

	expectToolCall(toolCalls, "previewCreateSchedule", {
		customer_id: "cus_contract",
	});

	expectApiCall(api, "previewCreateSchedule", {
		customer_id: "cus_contract",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: time("2027-01-01T00:00:00.000Z"),
				plans: [{ plan_id: "pro" }, { plan_id: "addon" }],
			},
			{
				starts_at: time("2027-02-01T00:00:00.000Z"),
				plans: [{ plan_id: "enterprise" }],
			},
		],
	});
	expectNoApiCall(api, "createSchedule");

	await approve("Looks good, go ahead.");

	expectToolCall(toolCalls, "createSchedule", {
		customer_id: "cus_contract",
	});
	expectApiCall(api, "createSchedule", {
		customer_id: "cus_contract",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: time("2027-01-01T00:00:00.000Z"),
				plans: [{ plan_id: "pro" }, { plan_id: "addon" }],
			},
			{
				starts_at: time("2027-02-01T00:00:00.000Z"),
				plans: [{ plan_id: "enterprise" }],
			},
		],
	});
}, 30000);

test("asks for customer id before previewing future contract price changes", async () => {
	const expectedSchedule = {
		customer_id: "cus_fee_schedule",
		redirect_mode: "if_required",
		phases: [
			{
				starts_at: time("2027-01-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "enterprise",
						customize: {
							price: { amount: 120000, interval: BillingInterval.Year },
						},
					},
				],
			},
			{
				starts_at: time("2028-01-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "enterprise",
						customize: {
							price: { amount: 150000, interval: BillingInterval.Year },
						},
					},
				],
			},
		],
	} satisfies ToolRequestInput<"createSchedule">;
	const { api, approve, generate, toolCalls } = initMcpEval({
		today: parseISO("2026-06-01T00:00:00.000Z"),
		fixtures: {
			getCustomer: {
				id: "cus_fee_schedule",
				name: "Fee Schedule Co",
				subscriptions: [
					{
						planId: "enterprise",
						status: "active",
						currentPeriodStart: time("2026-01-01T00:00:00.000Z"),
						currentPeriodEnd: time("2027-01-01T00:00:00.000Z"),
					},
				],
			},
			listPlans: {
				list: [{ id: "enterprise", name: "Enterprise" }],
			},
			getPlan: (body: ToolRequest<"getPlan">) => ({
				id: body.plan_id,
				name: body.plan_id,
			}),
			previewCreateSchedule: {
				total: 0,
				subtotal: 0,
				line_items: [],
			},
			createSchedule: {
				status: "created",
				schedule_id: "sched_fee_schedule",
			},
		},
	});

	const missingIdOutput = await generate([
		"I have a customer with a three-year Enterprise contract. Year 1 is already paid, but years 2 and 3 need new annual prices.",
		"Can you help set that up?",
	]);

	expect(missingIdOutput.text.toLowerCase()).toContain("customer");
	expectNoToolCall(toolCalls, "previewCreateSchedule");
	expectNoToolCall(toolCalls, "createSchedule");
	expectNoApiCall(api, "previewCreateSchedule");
	expectNoApiCall(api, "createSchedule");

	await generate([
		"Customer id is cus_fee_schedule.",
		"Use Enterprise. Contract year 1 runs January 1, 2026 through December 31, 2026 and is already paid, so don't bill or change anything in that year.",
		"Set year 2 to $120,000/year starting January 1, 2027, and year 3 to $150,000/year starting January 1, 2028.",
		"Can you check what the upcoming price changes would look like before we apply them?",
	]);

	expectToolCall(toolCalls, "getCustomer", {
		customer_id: "cus_fee_schedule",
	});
	expectToolCall(toolCalls, "previewCreateSchedule", {
		customer_id: "cus_fee_schedule",
	});
	expectExactApiCall(api, "previewCreateSchedule", expectedSchedule);
	expectNoApiCall(api, "createSchedule");

	await approve("Looks good, go ahead.");

	expectToolCall(toolCalls, "createSchedule", {
		customer_id: "cus_fee_schedule",
	});
	expectExactApiCall(api, "createSchedule", expectedSchedule);
}, 60000);

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
				starts_at: time("2027-04-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "growth",
						customize: {
							items: [
								{ feature_id: "seats", included: 25 },
								{
									feature_id: "api_calls",
									included: 100000,
									reset: { interval: ResetInterval.Month },
								},
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
				starts_at: time("2027-07-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "growth",
						customize: {
							items: [
								{ feature_id: "seats", included: 40 },
								{
									feature_id: "api_calls",
									included: 250000,
									reset: { interval: ResetInterval.Month },
								},
							],
						},
					},
					{ plan_id: "priority_support" },
				],
			},
			{
				starts_at: time("2028-01-01T00:00:00.000Z"),
				plans: [
					{
						plan_id: "enterprise",
						customize: {
							price: { amount: 2400, interval: BillingInterval.Month },
							items: [
								{ feature_id: "seats", included: 75 },
								{
									feature_id: "api_calls",
									included: 1000000,
									reset: { interval: ResetInterval.Month },
								},
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
	const { api, approve, generate, toolCalls } = initMcpEval({
		today: parseISO("2026-06-01T00:00:00.000Z"),
		fixtures: {
			listCustomers: {
				list: [
					{
						id: "cus_northstar_contract",
						name: "Northstar Labs",
						email: "billing@northstar.example",
					},
				],
			},
			getCustomer: {
				id: "cus_northstar_contract",
				name: "Northstar Labs",
				email: "billing@northstar.example",
			},
			listPlans: {
				list: [
					{ id: "growth", name: "Growth" },
					{ id: "implementation", name: "Implementation" },
					{ id: "priority_support", name: "Priority Support" },
					{ id: "enterprise", name: "Enterprise" },
				],
			},
			getPlan: (body: ToolRequest<"getPlan">) => ({
				id: body.plan_id,
				name: body.plan_id,
			}),
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
		"Order Form OF-2027-041 | Prepared for Northstar Labs Ltd.",
		"Effective date: March 12, 2027. Governing law: New York. Payment terms: Net 30. Notices should be sent to legal@northstar.example.",
		"Extracted service dates: initial ramp starts 2027-04-01; expansion starts 2027-07-01; enterprise conversion starts 2028-01-01.",
		"Billing contact: billing@northstar.example. Customer reference in Autumn should be resolved from this account name or billing contact before any schedule is prepared.",
		"Section 2. Initial ramp. On April 1, 2027, start the Growth plan with 25 seats and 100,000 API calls per month. Add the one-time Implementation plan at $1,500 for onboarding work.",
		"Section 3. Expansion. On July 1, 2027, keep Growth active, increase to 40 seats and 250,000 API calls per month, and add Priority Support.",
		"Section 4. Enterprise conversion. On January 1, 2028, move to Enterprise at a custom $2,400/month base rate with 75 seats and 1,000,000 API calls per month. Keep Priority Support.",
		"Enterprise conversion also includes contract-specific feature overrides that are not part of the standard Enterprise plan: unlimited sso, 365 audit_logs per month, unlimited data_residency, 1 premium_onboarding grant, 10 dedicated_success hours per month, and 2 security_review credits per year.",
		"Section 8. Confidentiality. Neither party may disclose pricing or implementation details except to auditors, investors, or legal advisors under confidentiality obligations.",
		"Section 11. Service levels. Support response targets are commercially reasonable and do not create service credits unless separately stated in an SLA exhibit.",
		"Signature block: Northstar Labs Ltd. / Autumn Software Inc.",
	].join("\n");

	await generate([
		"A PDF text extractor returned the contract text below.",
		"Please handle this in Autumn using only the extracted text.",
		"Make sure all feature limits and overrides from the contract are reflected in the schedule.",
		"Apply the contract-specific feature overrides to the Enterprise phase.",
		extractedContractText,
	]);

	expectToolCall(toolCalls, "listCustomers");
	expectToolCall(toolCalls, "listPlans");
	expectToolCall(toolCalls, "previewCreateSchedule", {
		customer_id: "cus_northstar_contract",
	});
	const previewCall = expectExactApiCall(
		api,
		"previewCreateSchedule",
		expectedSchedule,
	);
	expectCustomFeatures(previewCall?.rawBody, customFeatureIds);
	expectNoApiCall(api, "createSchedule");

	await approve("Looks good, go ahead.");

	expectToolCall(toolCalls, "createSchedule", {
		customer_id: "cus_northstar_contract",
	});
	const createCall = expectExactApiCall(
		api,
		"createSchedule",
		expectedSchedule,
	);
	expectCustomFeatures(createCall?.rawBody, customFeatureIds);
}, 60000);
