import { describe, expect, test } from "bun:test";
import {
	type GetCatalogResponse,
	UpdateCatalogParamsSchema,
} from "@autumn/shared";
import { catalogToUpdateParams } from "../../../../src/views/products/catalog-transfer/utils/catalogToUpdateParams";

const SOURCE_IDS = [
	"fe_source_messages",
	"prod_source_pro",
	"prod_source_annual",
	"prod_source_seat",
	"pr_source_base",
	"pr_source_item",
	"ent_source_messages",
	"price_stripe_base",
	"price_stripe_item",
	"prod_stripe_pro",
	"mtr_stripe_messages",
	"rew_source_launch",
	"rp_source_referral",
];

const catalog = {
	features: [
		{
			id: "messages",
			internal_id: "fe_source_messages",
			name: "Messages",
			type: "metered",
			consumable: true,
			event_names: [],
			archived: false,
			processors: {
				stripe: {
					product_id: "prod_stripe_pro",
					meter_id: "mtr_stripe_messages",
				},
			},
		},
	],
	plans: [
		{
			id: "pro",
			internal_id: "prod_source_pro",
			name: "Pro",
			description: null,
			group: "core",
			version: 2,
			version_slug: "v2",
			active: true,
			add_on: false,
			auto_enable: false,
			processors: { stripe: { product_id: "prod_stripe_pro" } },
			price: {
				amount: 49,
				interval: "month",
				price_id: "pr_source_base",
				processors: { stripe: { price_id: "price_stripe_base" } },
				display: { primary_text: "$49", secondary_text: "per month" },
			},
			items: [
				{
					feature_id: "messages",
					included: 5000,
					unlimited: false,
					pooled: false,
					reset: { interval: "month" },
					price: {
						amount: 0.01,
						interval: "month",
						billing_units: 1,
						billing_method: "usage_based",
						max_purchase: null,
						processors: { stripe: { price_id: "price_stripe_item" } },
					},
					display: { primary_text: "5,000 Messages" },
					mapping_identity: '["messages","usage_based","month",1]',
					entitlement_id: "ent_source_messages",
					price_id: "pr_source_item",
				},
			],
			created_at: 1700000000000,
			env: "sandbox",
			archived: false,
			config: { ignore_past_due: false, anchor_to_month_start: false },
			billing_controls: {},
			metadata: {},
			base_variant_id: null,
			variants: [
				{
					mapping_identity: '["pro_annual"]',
					variant_plan_id: "pro_annual",
					name: "Pro (annual)",
					customize: { price: { amount: 490, interval: "year" } },
					plan: { id: "pro_annual", internal_id: "prod_source_annual" },
				},
			],
			licenses: [
				{
					license_plan_id: "seat",
					version: 1,
					version_slug: "v1",
					included: 3,
					prepaid_only: true,
					plan: { id: "seat", internal_id: "prod_source_seat" },
				},
			],
		},
	],
	rewards: [
		{
			coupon: {
				id: "launch20",
				internal_id: "rew_source_launch",
				name: "Launch 20%",
				type: "percentage_discount",
				value: 20,
				duration: { type: "months", length: 3 },
				plan_ids: null,
				promo_codes: [{ code: "LAUNCH20" }],
				created_at: 1700000000000,
			},
		},
	],
	referral_programs: [
		{
			id: "friends",
			internal_id: "rp_source_referral",
			name: "Friends",
		},
	],
} as unknown as GetCatalogResponse;

const ALL_SECTIONS = { features: true, plans: true, rewards: true };

describe("catalogToUpdateParams", () => {
	test("strips Stripe ids, processor mappings and source-org row ids", () => {
		const json = JSON.stringify(
			catalogToUpdateParams({ catalog, sections: ALL_SECTIONS }),
		);
		for (const id of SOURCE_IDS) expect(json).not.toContain(id);
		expect(json).not.toContain('"processors"');
		expect(json).not.toContain('"internal_id"');
	});

	test("writes a body catalogV2.update accepts", () => {
		const params = catalogToUpdateParams({
			catalog,
			sections: { features: true, plans: true, rewards: false },
		});
		expect(UpdateCatalogParamsSchema.safeParse(params).success).toBe(true);
		expect(params.features?.[0]).toMatchObject({ feature_id: "messages" });
		expect(params.plans?.[0]).toMatchObject({
			plan_id: "pro",
			version: 2,
			new_version_slug: "v2",
			variants: [{ variant_plan_id: "pro_annual", name: "Pro (annual)" }],
			licenses: [{ license_plan_id: "seat", version_slug: "v1", included: 3 }],
		});
		expect(params.plans?.[0]).not.toHaveProperty("version_slug");
	});

	test("drops the legacy base_variant_id grouping hint from top-level plans", () => {
		const legacy = {
			...catalog,
			plans: [{ ...catalog.plans[0], id: "annual", base_variant_id: "pro" }],
		} as GetCatalogResponse;
		const params = catalogToUpdateParams({
			catalog: legacy,
			sections: { features: false, plans: true, rewards: false },
		});
		expect(params.plans?.[0]).not.toHaveProperty("base_variant_id");
	});

	test("pins a row without a version_slug by version alone", () => {
		const unslugged = {
			...catalog,
			plans: [{ ...catalog.plans[0], version: 1, version_slug: null }],
		} as GetCatalogResponse;
		const [plan] =
			catalogToUpdateParams({
				catalog: unslugged,
				sections: { features: false, plans: true, rewards: false },
			}).plans ?? [];
		expect(plan).toMatchObject({ plan_id: "pro", version: 1 });
		expect(plan).not.toHaveProperty("version_slug");
		expect(plan).not.toHaveProperty("new_version_slug");
	});

	test("leaves rewards and referral programs out unless the section is on", () => {
		const without = catalogToUpdateParams({
			catalog,
			sections: { features: true, plans: true, rewards: false },
		});
		expect(without).not.toHaveProperty("rewards");
		expect(without).not.toHaveProperty("referral_programs");

		const withRewards = catalogToUpdateParams({
			catalog,
			sections: ALL_SECTIONS,
		});
		expect(withRewards.rewards).toEqual([
			{
				coupon: {
					id: "launch20",
					name: "Launch 20%",
					type: "percentage_discount",
					value: 20,
					duration: { type: "months", length: 3 },
					plan_ids: null,
					promo_codes: [{ code: "LAUNCH20" }],
				},
			},
		]);
		expect(withRewards.referral_programs?.[0]).toMatchObject({ id: "friends" });
	});

	test("omits switched-off sections and never states webhooks or deletion flags", () => {
		const params = catalogToUpdateParams({
			catalog,
			sections: { features: false, plans: true, rewards: false },
		});
		expect(Object.keys(params)).toEqual(["plans"]);
		expect(params).not.toHaveProperty("webhooks");
		expect(params).not.toHaveProperty("skip_deletions");
	});
});
