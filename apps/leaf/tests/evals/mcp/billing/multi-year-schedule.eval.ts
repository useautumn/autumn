import { Eval } from "braintrust";
import { withCustomers } from "../../fixtures/createSetup.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	createEvalContext,
	createGenericMcpAgentDriver,
} from "../../harness/index.js";
import {
	type EvalExpected,
	type EvalOutput,
	expectedApiCalls,
	expectedToolCalls,
	finalTextIncludes,
	noCreateScheduleBeforePreview,
	noScheduleCalls,
} from "../../utils/scorers.js";

type EvalInput = {
	approval?: string;
	details?: string;
	prompt: string;
};

type EvalMetadata = {
	domain: "billing";
	scenario: "multi-year-sales-led-schedule";
	setup: string;
	source: "customer-slack-scenario-mining";
};

type EvalScoreArgs = {
	expected?: EvalExpected;
	output: EvalOutput;
};

const experimentName = "multi-year-schedule";
const evalToday = new Date("2026-06-08T00:00:00.000Z");
const addUtcYears = ({
	date,
	years,
}: {
	date: Date;
	years: number;
}) =>
	new Date(
		Date.UTC(
			date.getUTCFullYear() + years,
			date.getUTCMonth(),
			date.getUTCDate(),
			date.getUTCHours(),
			date.getUTCMinutes(),
			date.getUTCSeconds(),
			date.getUTCMilliseconds(),
		),
	);
const phaseStart = (yearsFromToday: number) =>
	addUtcYears({ date: evalToday, years: yearsFromToday }).getTime();

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers, plans, subscriptions }) => ({
		account: customers.active({
			email: "finance@northwind.example",
			id: "cus_sales_led_schedule",
			name: "Northwind Labs",
			subscriptions: [
				subscriptions.active({
					currentPeriodEnd: addUtcYears({ date: evalToday, years: 1 }),
					currentPeriodStart: evalToday,
					id: "sub_sales_led_enterprise",
					plan: plans.enterprise,
				}),
			],
		}),
	}),
});
const customer = setup.refs.customers.account;
const enterprisePlan = setup.refs.plans.enterprise;

const expectedPhases = [
	{
		plans: [
			{
				customize: {
					price: { amount: 100_000, interval: "year" },
				},
				plan_id: enterprisePlan.id,
			},
		],
		starts_at: phaseStart(0),
	},
	{
		plans: [
			{
				customize: {
					price: { amount: 125_000, interval: "year" },
				},
				plan_id: enterprisePlan.id,
			},
		],
		starts_at: phaseStart(1),
	},
	{
		plans: [
			{
				customize: {
					price: { amount: 150_000, interval: "year" },
				},
				plan_id: enterprisePlan.id,
			},
		],
		starts_at: phaseStart(2),
	},
];

const usesOnlyPriceOverrides = ({ output }: { output: EvalOutput }) => {
	const scheduleCalls = output.apiCalls.filter(
		(call) =>
			call.toolName === "previewCreateSchedule" ||
			call.toolName === "createSchedule",
	);
	if (!scheduleCalls.length) return 0;

	return scheduleCalls.every((call) =>
		Array.isArray(call.body.phases)
			? call.body.phases.every((phase) => {
					const phaseRecord = phase as Record<string, unknown>;
					return Array.isArray(phaseRecord.plans)
						? phaseRecord.plans.every((plan) => {
								const planRecord = plan as Record<string, unknown>;
								const customize = planRecord.customize as
									| Record<string, unknown>
									| undefined;
								return (
									planRecord.feature_quantities === undefined &&
									customize?.items === undefined &&
									customize?.price !== undefined
								);
							})
						: false;
				})
			: false,
	)
		? 1
		: 0;
};

Eval<EvalInput, EvalOutput, EvalExpected, EvalMetadata>(
	"leaf",
	{
		experimentName,
		data: [
			{
				expected: {
					apiCalls: [
						{ toolName: "listCustomers" },
						{ toolName: "listPlans" },
						{ toolName: "listFeatures" },
						{
							body: { customer_id: customer.id },
							toolName: "getCustomer",
						},
						{
							body: {
								customer_id: customer.id,
								phases: expectedPhases,
								redirect_mode: "if_required",
							},
							toolName: "previewCreateSchedule",
						},
						{
							body: {
								customer_id: customer.id,
								phases: expectedPhases,
								redirect_mode: "if_required",
							},
							toolName: "createSchedule",
						},
					],
					finalTextIncludes: [
						"Northwind Labs",
						"Enterprise",
						"2026",
						"2027",
						"2028",
						"credits",
						"unchanged",
					],
					toolCalls: [
						"listCustomers",
						"listPlans",
						"listFeatures",
						"getCustomer",
						"previewCreateSchedule",
						"createSchedule",
					],
				},
				input: {
					approval: "Looks good, create the schedule.",
					details: [
						"Use customer Northwind Labs, customer id cus_sales_led_schedule.",
						"Use the Enterprise plan at customer level.",
						"Contract starts today, June 8, 2026.",
						"Year 1 is $100,000/year starting June 8, 2026.",
						"Year 2 is $125,000/year starting one year from today, June 8, 2027.",
						"Year 3 is $150,000/year starting two years from today, June 8, 2028.",
						"Credits and feature access stay unchanged in every year.",
						"Do not send an invoice or checkout now; preview the schedule first.",
					].join(" "),
					prompt:
						"Northwind Labs has a three-year sales-led Enterprise schedule. Please provision it in Autumn; the annual price changes each year, but credits do not change.",
				},
				metadata: {
					domain: "billing",
					scenario: "multi-year-sales-led-schedule",
					setup: setup.tag,
					source: "customer-slack-scenario-mining",
				},
			},
			{
				expected: {
					finalTextIncludes: ["Northwind Labs", "now", "past"],
				},
				input: {
					prompt: [
						"Please provision a three-year Enterprise schedule for Northwind Labs, customer id cus_sales_led_schedule.",
						"Year 1 is $100,000/year, year 2 is $125,000/year, and year 3 is $150,000/year.",
						"Credits and feature access stay unchanged in every year.",
					].join(" "),
				},
				metadata: {
					domain: "billing",
					scenario: "multi-year-sales-led-schedule",
					setup: setup.tag,
					source: "customer-slack-scenario-mining",
				},
			},
		],
		scores: [
			(args: EvalScoreArgs) => ({
				name: "Expected tool calls",
				score: expectedToolCalls(args),
			}),
			(args: EvalScoreArgs) => ({
				name: "Expected API calls",
				score: expectedApiCalls(args),
			}),
			(args: EvalScoreArgs) => ({
				name: "Final text includes",
				score: finalTextIncludes(args),
			}),
			(args: EvalScoreArgs) => ({
				name: "Preview before create schedule",
				score: noCreateScheduleBeforePreview(args),
			}),
			(args: EvalScoreArgs) => ({
				name: "Only price overrides",
				score:
					args.expected?.apiCalls?.some(
						(call) => call.toolName === "previewCreateSchedule",
					) ||
					args.expected?.apiCalls?.some(
						(call) => call.toolName === "createSchedule",
					)
						? usesOnlyPriceOverrides(args)
						: 1,
			}),
			(args: EvalScoreArgs) => ({
				name: "No schedule calls without start clarification",
				score:
					args.expected?.apiCalls || args.expected?.toolCalls
						? 1
						: noScheduleCalls(args),
			}),
		],
		task: async (input: EvalInput) => {
			const context = await createEvalContext({
				autumnApiOverrides: {
					createSchedule: ({ body }) => ({
						customer_id: body.customer_id,
						entity_id: null,
						invoice: null,
						payment_url: null,
						phases: expectedPhases.map((phase, index) => ({
							customer_product_ids: [`cp_schedule_${index + 1}`],
							phase_id: `phase_schedule_${index + 1}`,
							starts_at: phase.starts_at,
						})),
						schedule_id: "sched_sales_led_multiyear",
						status: "created",
					}),
					previewCreateSchedule: ({ body }) => ({
						currency: "usd",
						customer_id: body.customer_id,
						line_items: expectedPhases.map((phase, index) => ({
							description: `Enterprise year ${index + 1}`,
							starts_at: phase.starts_at,
							total: phase.plans[0].customize.price.amount,
						})),
						total: 375_000,
					}),
				},
				driver: createGenericMcpAgentDriver(),
				name: experimentName,
				setup,
				today: evalToday,
			});
			try {
				const turns = [
					{ message: input.prompt, type: "user" as const },
					...(input.details
						? [{ message: input.details, type: "user" as const }]
						: []),
					...(input.approval
						? [
								{ message: input.approval, type: "user" as const },
								{ optional: true, type: "approve" as const },
							]
						: []),
				];
				return await context.runConversation(turns);
			} finally {
				await context.cleanup();
			}
		},
		timeout: 60_000,
	},
	{ noSendLogs: !process.env.BRAINTRUST_API_KEY },
);
