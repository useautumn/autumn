import { type ApiPlanV1, BillingInterval } from "@autumn/shared";
import type { GenerationContext } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext";

const NOW_MS = Date.UTC(2026, 7, 24, 12, 0, 0);

const now = { epoch_ms: NOW_MS, iso: new Date(NOW_MS).toISOString() };

/** Simple SaaS org: pro ($20/mo, prepaid messages) and premium ($50/mo). */
export const saasContext = ({
	onPro = false,
}: {
	onPro?: boolean;
} = {}): GenerationContext =>
	({
		customer: {
			id: "cus_demo",
			name: "Demo Corp",
			current_plans: onPro
				? [
						{
							customer_product_id: "cp_pro_demo",
							plan_id: "pro",
							status: "active",
						},
					]
				: [],
		},
		features: [
			{ id: "messages", name: "Messages", type: "single_use" },
			{ id: "sso", name: "SSO", type: "static" },
		],
		now,
		plans: [
			{
				id: "pro",
				name: "Pro",
				price: { amount: 20, interval: "month" },
				items: [
					{
						feature_id: "messages",
						included: 0,
						price: {
							amount: 10,
							billing_method: "prepaid",
							billing_units: 100,
							interval: "month",
						},
						reset: { interval: "month" },
					},
				],
			},
			{
				id: "premium",
				name: "Premium",
				price: { amount: 50, interval: "month" },
				items: [{ feature_id: "sso" }],
			},
		],
	}) as unknown as GenerationContext;

export const versionedPlanContext = ({
	currentPrice = { amount: 20, interval: BillingInterval.Month },
}: {
	currentPrice?: ApiPlanV1["price"];
} = {}): GenerationContext =>
	({
		customer: {
			id: "cus_versioned",
			current_plans: [
				{
					customer_product_id: "cp_versioned",
					effective_plan: {
						id: "generation",
						items: [
							{
								feature_id: "messages",
								included: 200,
								reset: { interval: "month" },
							},
						],
						name: "Generation Version Plan",
						price: currentPrice,
						version: 2,
					},
					plan_id: "generation",
					status: "active",
				},
			],
		},
		features: [{ id: "messages", name: "Messages", type: "single_use" }],
		now,
		plans: [10, 20, 30].map((amount, index) => ({
			id: "generation",
			items: [
				{
					feature_id: "messages",
					included: (index + 1) * 100,
					reset: { interval: "month" },
				},
			],
			name: "Generation Version Plan",
			price: { amount, interval: "month" },
			version: index + 1,
		})),
	}) as unknown as GenerationContext;

export const complexScheduleStarts = [
	Date.UTC(2026, 7, 24, 12),
	Date.UTC(2027, 7, 24, 12),
	Date.UTC(2028, 7, 24, 12),
	Date.UTC(2029, 7, 24, 12),
];

const monthlyItem = (feature_id: string, included: number) => ({
	feature_id,
	included,
	pooled: false,
	reset: { interval: "month" },
});

const planFeatureIds: Record<string, string> = {
	"analytics-addon": "reports",
	core: "messages",
	"success-addon": "sessions",
	"support-addon": "tickets",
};

const customizedPlan = ({
	amount,
	included,
	plan_id,
	version = 1,
}: {
	amount: number;
	included: number;
	plan_id: string;
	version?: number;
}) => ({
	customize: {
		items: [monthlyItem(planFeatureIds[plan_id]!, included)],
		price: { amount, interval: "month" },
	},
	plan_id,
	version,
});

export const complexScheduleRequest = ({
	phaseTwoVersion = 2,
	phaseThreeSupportPrice = 275,
	phaseFourMessages = 40_000,
}: {
	phaseTwoVersion?: number;
	phaseThreeSupportPrice?: number;
	phaseFourMessages?: number;
} = {}): Record<string, unknown> => ({
	billing_behavior: "none",
	billing_cycle_anchor: "now",
	phases: [
		[900, 12_000, 1, 175, 5_000, 225, 25],
		[1_100, 20_000, phaseTwoVersion, 190, 7_500, 250, 50],
		[1_350, 30_000, 3, 200, 9_000, phaseThreeSupportPrice, 75],
		[1_500, phaseFourMessages, 3, 225, 10_000, 300, 100],
	].map(
		(
			[
				corePrice,
				messages,
				version,
				analyticsPrice,
				reports,
				supportPrice,
				tickets,
			],
			index,
		) => ({
			...(index % 2 ? { billing_cycle_anchor: "phase_start" } : {}),
			plans: [
				customizedPlan({
					amount: corePrice,
					included: messages,
					plan_id: "core",
					version,
				}),
				customizedPlan({
					amount: analyticsPrice,
					included: reports,
					plan_id: "analytics-addon",
				}),
				customizedPlan({
					amount: supportPrice,
					included: tickets,
					plan_id: "support-addon",
				}),
			],
			starts_at: complexScheduleStarts[index],
		}),
	),
	unscheduled_plans: [
		customizedPlan({
			amount: 95,
			included: 25,
			plan_id: "success-addon",
		}),
	],
});

export const complexScheduleContext = (): GenerationContext => {
	const plans = [
		...[1, 2, 3].map((version) => ({
			id: "core",
			items: [monthlyItem("messages", version * 10_000)],
			name: "Core",
			price: { amount: version * 500, interval: "month" },
			version,
		})),
		...(
			[
				["analytics-addon", "Analytics Add-on", 200, 5_000, "reports"],
				["support-addon", "Support Add-on", 300, 50, "tickets"],
				["success-addon", "Success Add-on", 100, 25, "sessions"],
			] as const
		).map(([id, name, amount, included, featureId]) => ({
			id,
			is_add_on: true,
			items: [monthlyItem(featureId, included)],
			name,
			price: { amount, interval: "month" },
			version: 1,
		})),
	];
	const schedule = complexScheduleRequest() as {
		phases: {
			billing_cycle_anchor?: string;
			plans: ReturnType<typeof customizedPlan>[];
			starts_at: number;
		}[];
	};
	const customerProductId = (phase: number, planId: string) =>
		`cp_${phase + 1}_${planId}`;

	return {
		customer: {
			current_plans: schedule.phases.flatMap((phase, phaseIndex) =>
				phase.plans.map((plan) => ({
					customer_product_id: customerProductId(phaseIndex, plan.plan_id),
					effective_plan: {
						...plans.find(
							(candidate) =>
								candidate.id === plan.plan_id &&
								candidate.version === plan.version,
						),
						...plan.customize,
					},
					plan_id: plan.plan_id,
					status: phaseIndex ? "scheduled" : "active",
				})),
			),
			id: "cus_complex_schedule",
			name: "Example Company",
			schedules: [
				{
					phases: schedule.phases.map((phase, phaseIndex) => ({
						...(phase.billing_cycle_anchor
							? { billing_cycle_anchor: phase.billing_cycle_anchor }
							: {}),
						customer_product_ids: phase.plans.map((plan) =>
							customerProductId(phaseIndex, plan.plan_id),
						),
						starts_at: phase.starts_at,
					})),
				},
			],
		},
		features: [
			{ id: "messages", name: "Messages", type: "single_use" },
			{ id: "reports", name: "Reports", type: "single_use" },
			{ id: "sessions", name: "Success Sessions", type: "single_use" },
			{ id: "tickets", name: "Support Tickets", type: "single_use" },
		],
		now,
		plans,
	} as unknown as GenerationContext;
};

/** Enterprise org with a volume-tiered prepaid credits ladder — the shape that
 * stresses same-shape customize patches. */
export const creditLadderContext = (): GenerationContext =>
	({
		customer: {
			id: "cus_enterprise",
			name: "Big Enterprise",
			current_plans: [],
		},
		features: [{ id: "credits", name: "Credits", type: "single_use" }],
		now,
		plans: [
			{
				id: "enterprise",
				name: "Enterprise",
				items: [
					{
						feature_id: "credits",
						included: 1000,
						price: {
							billing_method: "prepaid",
							interval: "month",
							tier_behavior: "volume",
							tiers: [
								{ amount: 0, flat_amount: 90, to: 11000 },
								{ amount: 0, flat_amount: 400, to: 51000 },
								{ amount: 0, flat_amount: 700, to: "inf" },
							],
						},
						reset: { interval: "month" },
					},
				],
			},
		],
	}) as unknown as GenerationContext;

/** Org with sibling plan variants (scale / scale_yearly) plus a credits item —
 * the ambiguity the docs tell interactive agents to ask about. */
export const variantLadderContext = (): GenerationContext =>
	({
		customer: {
			id: "cus_variant",
			name: "Variant Co",
			current_plans: [],
		},
		features: [{ id: "credits", name: "Credits", type: "single_use" }],
		now,
		plans: [
			{
				id: "enterprise",
				name: "Enterprise",
				items: [
					{
						feature_id: "credits",
						included: 1000,
						price: {
							billing_method: "prepaid",
							interval: "month",
							tier_behavior: "volume",
							tiers: [
								{ amount: 0, flat_amount: 200, to: 3000 },
								{ amount: 0, flat_amount: 400, to: 6000 },
								{ amount: 0, flat_amount: 600, to: "inf" },
							],
						},
						reset: { interval: "month" },
					},
				],
			},
			{
				id: "scale",
				name: "Scale",
				price: { amount: 1000, interval: "month" },
				items: [
					{
						feature_id: "credits",
						included: 1000,
						reset: { interval: "month" },
					},
				],
			},
			{
				id: "scale_yearly",
				name: "Scale (Yearly)",
				price: { amount: 10000, interval: "year" },
				items: [
					{
						feature_id: "credits",
						included: 1000,
						reset: { interval: "month" },
					},
				],
			},
		],
	}) as unknown as GenerationContext;

export const rolloverCreditsContext = (): GenerationContext =>
	({
		customer: {
			id: "cus_mintlify_like",
			name: "Mintlify-like Co",
			current_plans: [
				{ customer_product_id: "cp_pro_1", plan_id: "pro", status: "active" },
			],
			entities: [],
		},
		features: [
			{ id: "AI_CREDITS", name: "AI Credits", type: "credit_system" },
			{ id: "ADMIN_API_ACCESS", name: "Admin API Access", type: "static" },
		],
		now,
		plans: [
			{
				id: "pro",
				name: "Pro",
				price: { amount: 540, interval: "month" },
				items: [
					{
						feature_id: "AI_CREDITS",
						included: 10_000,
						pooled: true,
						reset: { interval: "month" },
						rollover: {
							expiry_duration_length: 1,
							expiry_duration_type: "month",
							max_percentage: 50,
						},
					},
					{
						feature_id: "AI_CREDITS",
						included: 0,
						price: {
							amount: 0.01,
							billing_method: "usage_based",
							billing_units: 1,
							interval: "month",
						},
						reset: { interval: "month" },
					},
					{ feature_id: "ADMIN_API_ACCESS" },
				],
			},
		],
	}) as unknown as GenerationContext;

export const rolloverCreditsBaseItems = (): ApiPlanV1["items"] =>
	[
		{
			feature_id: "AI_CREDITS",
			included: 10_000,
			pooled: true,
			price: null,
			reset: { interval: "month" },
			rollover: {
				expiry_duration_length: 1,
				expiry_duration_type: "month",
				max: null,
				max_percentage: 50,
			},
			unlimited: false,
		},
		{
			feature_id: "AI_CREDITS",
			included: 0,
			price: {
				amount: 0.01,
				billing_method: "usage_based",
				billing_units: 1,
				interval: "month",
				max_purchase: null,
			},
			reset: { interval: "month" },
			unlimited: false,
		},
		{ feature_id: "ADMIN_API_ACCESS", included: 0, price: null, reset: null },
	] as unknown as ApiPlanV1["items"];

/** Tiered prepaid credits on the customer's live plan — changing `included`
 * must shift tier boundaries, not drop or reprice tiers. */
export const tieredScaleContext = (): GenerationContext =>
	({
		customer: {
			id: "cus_scale",
			name: "Scale Co",
			current_plans: [
				{
					customer_product_id: "cp_scale_1",
					plan_id: "scale",
					status: "active",
				},
			],
			entities: [],
		},
		features: [{ id: "credits", name: "Credits", type: "single_use" }],
		now,
		plans: [
			{
				id: "scale",
				name: "Scale",
				price: { amount: 500, interval: "month" },
				items: [
					{
						feature_id: "credits",
						included: 1000,
						price: {
							billing_method: "prepaid",
							billing_units: 1000,
							interval: "month",
							tier_behavior: "volume",
							tiers: [
								{ amount: 0, flat_amount: 200, to: 3000 },
								{ amount: 0, flat_amount: 400, to: 6000 },
								{ amount: 0, flat_amount: 600, to: "inf" },
							],
						},
						reset: { interval: "month" },
					},
					{
						feature_id: "credits",
						included: 0,
						price: {
							amount: 0.1,
							billing_method: "usage_based",
							billing_units: 1,
							interval: "month",
						},
						reset: { interval: "month" },
					},
				],
			},
		],
	}) as unknown as GenerationContext;

export const tieredScaleBaseItems = (): ApiPlanV1["items"] =>
	[
		{
			feature_id: "credits",
			included: 1000,
			price: {
				billing_method: "prepaid",
				billing_units: 1000,
				interval: "month",
				max_purchase: null,
				tier_behavior: "volume",
				tiers: [
					{ amount: 0, flat_amount: 200, to: 3000 },
					{ amount: 0, flat_amount: 400, to: 6000 },
					{ amount: 0, flat_amount: 600, to: "inf" },
				],
			},
			reset: { interval: "month" },
			unlimited: false,
		},
		{
			feature_id: "credits",
			included: 0,
			price: {
				amount: 0.1,
				billing_method: "usage_based",
				billing_units: 1,
				interval: "month",
				max_purchase: null,
			},
			reset: { interval: "month" },
			unlimited: false,
		},
	] as unknown as ApiPlanV1["items"];

/** Two entities where only one holds the plan — the model must read
 * current_plans entity scoping to target the other. */
export const entityScaleContext = (): GenerationContext =>
	({
		customer: {
			id: "cus_entities",
			name: "Entities Co",
			current_plans: [
				{
					customer_product_id: "cp_scale_alpha",
					entity_id: "alpha",
					plan_id: "scale",
					status: "active",
				},
			],
			entities: [
				{ id: "alpha", name: "Alpha Site" },
				{ id: "beta", name: "Beta Site" },
			],
		},
		features: [{ id: "credits", name: "Credits", type: "single_use" }],
		now,
		plans: [
			{
				id: "scale",
				name: "Scale",
				price: { amount: 500, interval: "month" },
				items: [
					{
						feature_id: "credits",
						included: 1000,
						reset: { interval: "month" },
					},
				],
			},
			{
				id: "enterprise",
				name: "Enterprise",
				items: [
					{
						feature_id: "credits",
						included: 5000,
						reset: { interval: "month" },
					},
				],
			},
		],
	}) as unknown as GenerationContext;
