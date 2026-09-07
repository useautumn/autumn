import { test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Dashboard fixture for QAing dimensioned plan-item feature_overrides.
 *
 * DimensionCredits catalog rate card for DimensionAction:
 *   base 1 credit · size=large 16 · size=large+region=eu 20
 *   size=xl graduated (first 5 @ 2, then 1) · lifecycle=spot ×0.3
 *
 * Each plan below overrides that card differently so every dashboard state —
 * inherited, changed, added, missing-vs-catalog — is visible on one screen.
 */

const withOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

// DimensionCredits carries invoice_credit, which requires usage-based pricing.
const dimensionItem = () =>
	items.consumable({
		featureId: TestFeature.DimensionCredits,
		includedUsage: 10_000,
		price: 1,
	});

test(
	`${chalk.yellowBright("scenario: credit override dimensions (dashboard QA)")}`,
	async () => {
		// Control: no override. The catalog card applies in full.
		const standard = products.pro({
			id: "qa-dim-standard",
			items: [dimensionItem()],
		});

		// Every dimension re-priced, and the spot multiplier flipped to a
		// surcharge. Dashboard should mark all rows "changed".
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

		// Flat override: every dimension and multiplier dropped. Total
		// replacement means size=large must bill the base rate, not 16.
		// Dashboard should show three rows as missing-vs-catalog.
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

		// A dimension the catalog does not have, keeping one catalog dimension
		// untouched. Dashboard: one inherited, one added, two missing.
		const extended = products.pro({
			id: "qa-dim-extended",
			items: [
				withOverride(dimensionItem(), {
					schema: [
						{
							metered_feature_id: TestFeature.DimensionAction,
							credit_amount: 1,
							// size=large wins an event that is also region=apac.
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

		// One customer per plan, so the dashboard shows all four states side by
		// side. Each needs its own payment method — these plans are paid, and an
		// attach without one returns a checkout URL instead of granting credits.
		const repricedId = "qa-dim-repriced";
		const flatId = "qa-dim-flat";
		const extendedId = "qa-dim-extended";

		const { customerId, autumnV2_3 } = await initScenario({
			customerId: "qa-dim-standard",
			setup: [
				s.customer({ paymentMethod: "success" }),
				// Stripe caps a test clock at 3 customers, and this scenario needs 4.
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

		// One large event per plan — the clearest cross-plan comparison.
		await trackDimension({
			customer: customerId,
			properties: { size: "large" },
		});
		await trackDimension({
			customer: repricedId,
			properties: { size: "large" },
		});
		await trackDimension({ customer: flatId, properties: { size: "large" } });

		// Catalog dimension kept by the override, plus its added one.
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
				"non-admin: dimensions section hidden on all four plans",
				"toggle dimensions off on qa-dim-repriced → warns before stripping rules",
				"customer sheet shows dimension + multiplier counts, not a flat rate",
			],
		});
	},
	{ timeout: 240_000 },
);
