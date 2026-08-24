import type { GenerationContext } from "@/internal/billing/v2/actions/generateRequest/generationContext";

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
				items: [
					{ interval: "month", price: 20 },
					{
						billing_units: 100,
						feature_id: "messages",
						included_usage: 0,
						interval: "month",
						price: 10,
						usage_model: "prepaid",
					},
				],
			},
			{
				id: "premium",
				name: "Premium",
				items: [{ interval: "month", price: 50 }, { feature_id: "sso" }],
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
						included_usage: 1000,
						interval: "month",
						usage_model: "prepaid",
						tiers: [
							{ amount: 0, flat_amount: 90, to: 10000 },
							{ amount: 0, flat_amount: 400, to: 50000 },
							{ amount: 0, flat_amount: 700, to: "inf" },
						],
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
		now: { epoch_ms: NOW_MS, iso: new Date(NOW_MS).toISOString() },
		plans: [
			{
				id: "enterprise",
				name: "Enterprise",
				items: [
					{
						feature_id: "credits",
						included_usage: 1000,
						interval: "month",
						usage_model: "prepaid",
						tiers: [
							{ amount: 0, flat_amount: 200, to: 2000 },
							{ amount: 0, flat_amount: 400, to: 5000 },
							{ amount: 0, flat_amount: 600, to: "inf" },
						],
					},
				],
			},
			{
				id: "scale",
				name: "Scale",
				items: [
					{ interval: "month", price: 1000 },
					{
						feature_id: "credits",
						included_usage: 1000,
						interval: "month",
					},
				],
			},
			{
				id: "scale_yearly",
				name: "Scale (Yearly)",
				items: [
					{ interval: "year", price: 10000 },
					{
						feature_id: "credits",
						included_usage: 1000,
						interval: "month",
					},
				],
			},
		],
	}) as unknown as GenerationContext;
