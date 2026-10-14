import { test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const withOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

const dimensionItem = () =>
	items.consumable({
		featureId: TestFeature.DimensionCredits,
		includedUsage: 10_000,
		price: 1,
	});

test(
	`${chalk.yellowBright("scenario: credit override dimensions (dashboard QA)")}`,
	async () => {
		const standard = products.pro({
			id: "qa-dim-standard",
			items: [dimensionItem()],
		});

		const repriced = products.pro({
			id: "qa-dim-repriced",
			items: [
				withOverride(dimensionItem(), {
					schema: [
						{
							metered_feature_id: TestFeature.DimensionAction,
							credit_amount: 2,
							dimensions: {
								size_large: { match: { size: "large" }, credit_amount: 8 },
								size_large_region_eu: {
									match: { size: "large", region: "eu" },
									credit_amount: 10,
								},
								size_xl: {
									match: { size: "xl" },
									tier_behavior: "graduated" as const,
									tiers: [
										{ to: 5, credit_amount: 4 },
										{ to: "inf" as const, credit_amount: 3 },
									],
								},
							},
							multipliers: {
								lifecycle_spot: { match: { lifecycle: "spot" }, factor: 2 },
							},
						},
					],
				}),
			],
		});

		const flattened = products.pro({
			id: "qa-dim-flat",
			items: [
				withOverride(dimensionItem(), {
					schema: [
						{
							metered_feature_id: TestFeature.DimensionAction,
							credit_amount: 3,
						},
					],
				}),
			],
		});

		const extended = products.pro({
			id: "qa-dim-extended",
			items: [
				withOverride(dimensionItem(), {
					schema: [
						{
							metered_feature_id: TestFeature.DimensionAction,
							credit_amount: 1,
							dimensions: {
								size_large: {
									match: { size: "large" },
									credit_amount: 16,
									priority: 10,
								},
								region_apac: {
									match: { region: "apac" },
									credit_amount: 7,
									priority: 1,
								},
							},
						},
					],
				}),
			],
		});

		const repricedId = "qa-dim-repriced";
		const flatId = "qa-dim-flat";
		const extendedId = "qa-dim-extended";

		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "qa-dim-standard",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([
					{ id: repricedId, paymentMethod: "success" },
					{ id: flatId, paymentMethod: "success", distinctTestClock: true },
					{ id: extendedId, paymentMethod: "success", distinctTestClock: true },
				]),
				s.products({ list: [standard, repriced, flattened, extended] }),
			],
			actions: [
				s.billing.attach({ productId: standard.id }),
				s.billing.attach({ customerId: repricedId, productId: repriced.id }),
				s.billing.attach({ customerId: flatId, productId: flattened.id }),
				s.billing.attach({ customerId: extendedId, productId: extended.id }),
			],
		});

		const trackDimension = async ({
			customer,
			properties,
			value = 1,
		}: {
			customer: string;
			properties: Record<string, string>;
			value?: number;
		}) => {
			await autumnV2_3.track(
				{
					customer_id: customer,
					feature_id: TestFeature.DimensionAction,
					value,
					properties,
				},
				{ timeout: 3_000 },
			);
		};

		const balanceOf = async (id: string) => {
			const customer = await autumnV2_3.customers.get<ApiCustomerV5>(id, {
				skip_cache: "true",
			});
			return customer.balances?.[TestFeature.DimensionCredits]?.remaining;
		};

		await trackDimension({
			customer: customerId,
			properties: { size: "large" },
		});
		await trackDimension({
			customer: repricedId,
			properties: { size: "large" },
		});
		await trackDimension({ customer: flatId, properties: { size: "large" } });

		await trackDimension({
			customer: extendedId,
			properties: { size: "large" },
		});
		await trackDimension({
			customer: extendedId,
			properties: { region: "apac" },
		});

		console.log("\ncredit override dimensions scenario:", {
			creditSystem: TestFeature.DimensionCredits,
			meteredFeature: TestFeature.DimensionAction,
			catalogCard:
				"base 1 · large 16 · large+eu 20 · xl graduated(5@2,then 1) · spot x0.3",
			included: 10_000,
			afterOneLargeEvent: {
				"qa-dim-standard (no override)": `${await balanceOf(customerId)} — expect 9984 (16 credits)`,
				"qa-dim-repriced (large=8)": `${await balanceOf(repricedId)} — expect 9992 (8 credits)`,
				"qa-dim-flat (dimensions dropped)": `${await balanceOf(flatId)} — expect 9997 (3 credits, NOT 16)`,
			},
			extendedPlan: {
				customer: extendedId,
				balance: `${await balanceOf(extendedId)} — expect 9977 (16 large + 7 apac)`,
				note: "size_large inherited from catalog, region_apac added by override",
			},
			dashboardChecks: [
				"qa-dim-repriced → all rows marked changed",
				"qa-dim-flat → 3 rows marked missing-vs-catalog",
				"qa-dim-extended → size_large inherited, region_apac added, 2 missing",
				"each override row carries its own Dimensions tables; plain rows show Add dimension",
				"Remove dimensions on qa-dim-repriced strips only that row's rules",
				"customer sheet shows dimension + multiplier counts, not a flat rate",
			],
		});
	},
	{ timeout: 240_000 },
);
