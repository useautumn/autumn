import type { ApiPlanV1 } from "@autumn/shared";
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
		],
	}) as unknown as GenerationContext;
