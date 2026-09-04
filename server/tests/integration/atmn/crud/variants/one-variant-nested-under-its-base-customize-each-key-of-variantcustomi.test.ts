/**
 * atmn crud/variants — one variant nested under its base [customize: each key of VariantCustomizeSchema]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * The base every case nests its variant under: a metered feature and an
 * "extra" feature to add, a seats item, a free trial, and a license link —
 * one thing to override per VariantCustomizeSchema key.
 */
const baseConfig = ({
	variantCustomize,
}: {
	variantCustomize: string;
}): string => `{
	features: [
		feature({ featureId: "seats", name: "Seats", type: "metered", consumable: false }),
		feature({ featureId: "extra", name: "Extra", type: "metered", consumable: false }),
	],
	plans: [
		plan({ planId: "seatLicense", name: "Seat License", price: { amount: 15, interval: "month" } }),
		plan({
			planId: "base",
			name: "Base",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "seats", included: 1 }],
			freeTrial: { durationLength: 14, durationType: "day" },
			licenses: [{ licensePlanId: "seatLicense", included: 5 }],
			variants: [
				{
					variantPlanId: "variant",
					name: "Variant",
					customize: ${variantCustomize},
				},
			],
		}),
	],
}`;

type Scenario = Awaited<ReturnType<typeof initAtmnScenario>>;

const CASES: Array<{
	key: string;
	customize: string;
	assert: (scenario: Scenario) => Promise<void>;
}> = [
	{
		key: "price",
		customize: `{ price: { amount: 120, interval: "month" } }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			expect(variant.price).toEqual(expect.objectContaining({ amount: 120 }));
		},
	},
	{
		key: "addItems",
		customize: `{ addItems: [{ featureId: "extra", included: 3 }] }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			expect(variant.items).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ feature_id: "extra", included: 3 }),
				]),
			);
		},
	},
	{
		key: "removeItems",
		customize: `{ removeItems: [{ featureId: "seats" }] }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			expect(
				(variant.items ?? []).some((item) => item.feature_id === "seats"),
			).toBe(false);
		},
	},
	{
		key: "freeTrial",
		customize: `{ freeTrial: { durationLength: 7, durationType: "day" } }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			expect(variant.free_trial).toEqual(
				expect.objectContaining({ duration_length: 7 }),
			);
		},
	},
	{
		key: "billingControls",
		customize: `{ billingControls: { spendLimits: [{ featureId: "seats", enabled: true, limitType: "absolute", overageLimit: 500 }] } }`,
		assert: async (scenario) => {
			const variant = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "variant",
			});
			expect(variant.spend_limits).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ overage_limit: 500 }),
				]),
			);
		},
	},
	{
		key: "upsertLicenses",
		customize: `{ upsertLicenses: [{ licensePlanId: "seatLicense", included: 10 }] }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			// @ts-expect-error licenses is not on the generated plan response type yet
			expect(variant.licenses).toEqual([
				expect.objectContaining({
					license_plan_id: "seatLicense",
					included: 10,
				}),
			]);
		},
	},
	{
		key: "removeLicenses",
		customize: `{ removeLicenses: [{ licensePlanId: "seatLicense" }] }`,
		assert: async (scenario) => {
			const variant =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variant");
			// @ts-expect-error licenses is not on the generated plan response type yet
			expect(variant.licenses ?? []).toEqual([]);
		},
	},
];

for (const { key, customize, assert } of CASES) {
	test.concurrent(
		`${chalk.yellowBright(`one variant nested under its base [customize: ${key}]`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `atmn_variant_customize_${key}@autumn.test`,
					}),
				],
				config: baseConfig({ variantCustomize: customize }),
			});

			try {
				await scenario.push();

				const variant = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "variant",
				});
				const base = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "base",
				});
				expect(variant.base_internal_product_id).toBe(base.internal_id);

				await assert(scenario);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
