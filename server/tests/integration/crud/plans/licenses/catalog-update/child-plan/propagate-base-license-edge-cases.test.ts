/** Customized catalog links rebase semantically; customer snapshots do not.
 * Overrides win conflicts, explicit removals persist, and no-op diffs collapse. */
import { expect, test } from "bun:test";
import {
	type ApiEntityV2,
	type ApiPlanV1,
	BillingInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { getFullLicenseProduct } from "../../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: preserves explicit license removals and overrides during base propagation")}`,
	async () => {
		const removedParent = products.base({
			id: "license-rebase-removed-parent",
			items: [items.dashboard()],
		});
		const overrideParent = products.base({
			id: "license-rebase-override-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-override-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-rebase-overrides",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [removedParent, overrideParent, license] }),
			],
			actions: [],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: removedParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
						remove_items: [{ feature_id: TestFeature.Messages }],
					},
				},
			],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: overrideParent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						price: { amount: 30, interval: BillingInterval.Month },
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [
							itemsV2.monthlyMessages({ included: 500 }),
							itemsV2.monthlyWords({ included: 500 }),
						],
					},
				},
			],
		});
		const overrideBefore = await getFullLicenseProduct({
			ctx,
			parentPlanId: overrideParent.id,
			licensePlanId: license.id,
		});
		const customEntitlementIds = new Set(
			overrideBefore.items.entitlements.map((entitlement) => entitlement.id),
		);

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [
				itemsV2.monthlyMessages({ included: 200 }),
				itemsV2.monthlyWords({ included: 100 }),
				itemsV2.monthlyCredits({ included: 25 }),
			],
		});
		const [removedAfterAdd, overrideAfterAdd] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: removedParent.id,
				licensePlanId: license.id,
			}),
			getFullLicenseProduct({
				ctx,
				parentPlanId: overrideParent.id,
				licensePlanId: license.id,
			}),
		]);
		expect(removedAfterAdd.items.entitlements).not.toContainEqual(
			expect.objectContaining({ feature_id: TestFeature.Messages }),
		);
		expect(removedAfterAdd.items.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 100,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Credits,
					allowance: 25,
				}),
			]),
		);
		expect(overrideAfterAdd.items.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Credits,
					allowance: 25,
				}),
			]),
		);
		for (const customId of customEntitlementIds) {
			expect(overrideAfterAdd.items.entitlements.map(({ id }) => id)).toContain(
				customId,
			);
		}

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyCredits({ included: 25 })],
		});
		const [removedAfterDelete, overrideAfterDelete] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: removedParent.id,
				licensePlanId: license.id,
			}),
			getFullLicenseProduct({
				ctx,
				parentPlanId: overrideParent.id,
				licensePlanId: license.id,
			}),
		]);
		expect(removedAfterDelete.items.entitlements).toEqual([
			expect.objectContaining({ feature_id: TestFeature.Credits }),
		]);
		expect(overrideAfterDelete.items.entitlements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Words,
					allowance: 500,
				}),
				expect.objectContaining({
					feature_id: TestFeature.Credits,
					allowance: 25,
				}),
			]),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: collapses only the license overrides that now match base")}`,
	async () => {
		const matchingParent = products.base({
			id: "license-rebase-partial-match-parent",
			items: [items.dashboard()],
		});
		const remainingParent = products.base({
			id: "license-rebase-partial-remaining-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-partial-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-rebase-partial",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [matchingParent, remainingParent, license] }),
			],
			actions: [],
		});
		for (const [parent, included] of [
			[matchingParent, 500],
			[remainingParent, 700],
		] as const) {
			await autumnV2_2.post("/plans.update", {
				plan_id: parent.id,
				licenses: [
					{
						license_plan_id: license.id,
						customize: {
							price: { amount: 20, interval: BillingInterval.Month },
							remove_items: [{ feature_id: TestFeature.Messages }],
							add_items: [itemsV2.monthlyMessages({ included })],
						},
					},
				],
			});
		}
		const matchingBefore = await getFullLicenseProduct({
			ctx,
			parentPlanId: matchingParent.id,
			licensePlanId: license.id,
		});
		const matchingCustomPriceId = matchingBefore.items.prices[0].id;

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 500 })],
		});
		const [matchingAfterItemMatch, baseAfterItemMatch] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: matchingParent.id,
				licensePlanId: license.id,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);
		expect(matchingAfterItemMatch.items.entitlements[0].id).toBe(
			baseAfterItemMatch.entitlements[0].id,
		);
		expect(matchingAfterItemMatch.items.prices[0].id).toBe(
			matchingCustomPriceId,
		);

		const remainingBeforePriceMatch = await getFullLicenseProduct({
			ctx,
			parentPlanId: remainingParent.id,
			licensePlanId: license.id,
		});
		const remainingCustomEntitlementId =
			remainingBeforePriceMatch.items.entitlements[0].id;
		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			price: { amount: 20, interval: BillingInterval.Month },
			items: [itemsV2.monthlyMessages({ included: 500 })],
		});
		const [matchingAfter, remainingAfter, baseAfter] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: matchingParent.id,
				licensePlanId: license.id,
			}),
			getFullLicenseProduct({
				ctx,
				parentPlanId: remainingParent.id,
				licensePlanId: license.id,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		expect(matchingAfter.planLicense.customized).toBe(false);
		expect(matchingAfter.items.entitlements).toHaveLength(0);
		expect(matchingAfter.items.prices).toHaveLength(0);
		expect(remainingAfter.planLicense.customized).toBe(true);
		expect(remainingAfter.items.entitlements[0].id).toBe(
			remainingCustomEntitlementId,
		);
		expect(remainingAfter.items.prices[0].id).toBe(baseAfter.prices[0].id);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: rebases paired license entitlement and price refs together")}`,
	async () => {
		const parent = products.base({
			id: "license-rebase-priced-item-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-priced-item-seat",
			items: [
				items.prepaidMessages({
					includedUsage: 100,
					billingUnits: 100,
					price: 5,
				}),
			],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-rebase-priced-item",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
					},
				},
			],
		});
		const before = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: license.id,
		});
		const customBasePrice = before.items.prices.find(
			(price) => !price.entitlement_id,
		);

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [
				itemsV2.prepaidMessages({
					included: 200,
					billingUnits: 100,
					amount: 15,
				}),
			],
		});
		const [after, baseAfter] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: parent.id,
				licensePlanId: license.id,
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);
		const baseEntitlement = baseAfter.entitlements[0];
		const baseFeaturePrice = baseAfter.prices.find(
			(price) => price.entitlement_id === baseEntitlement.id,
		);

		expect(after.items.entitlements).toContainEqual(
			expect.objectContaining({ id: baseEntitlement.id, allowance: 200 }),
		);
		expect(after.items.prices).toContainEqual(
			expect.objectContaining({
				id: baseFeaturePrice?.id,
				entitlement_id: baseEntitlement.id,
			}),
		);
		expect(after.items.prices).toContainEqual(
			expect.objectContaining({ id: customBasePrice?.id }),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: clears a catalog license customization that becomes a no-op")}`,
	async () => {
		const parent = products.base({
			id: "license-rebase-noop-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-noop-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-rebase-noop",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [],
		});
		await autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: license.id,
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
					},
				},
			],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			price: { amount: 20, interval: BillingInterval.Month },
			items: [itemsV2.monthlyMessages({ included: 100 })],
		});
		const [link, apiPlan] = await Promise.all([
			getFullLicenseProduct({
				ctx,
				parentPlanId: parent.id,
				licensePlanId: license.id,
			}),
			autumnV2_2.post("/plans.get", {
				plan_id: parent.id,
			}) as Promise<ApiPlanV1>,
		]);

		expect(link.planLicense.customized).toBe(false);
		expect(link.items.entitlements).toHaveLength(0);
		expect(link.items.prices).toHaveLength(0);
		expect(apiPlan.licenses?.[0]?.customize).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: leaves customer-specific license snapshots unchanged")}`,
	async () => {
		const customerId = "license-rebase-customer-snapshot";
		const parent = products.base({
			id: "license-rebase-customer-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-customer-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 1,
				}),
			],
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			license_quantities: [{ license_plan_id: license.id, quantity: 2 }],
			customize: {
				upsert_licenses: [
					{
						license_plan_id: license.id,
						customize: {
							price: { amount: 40, interval: BillingInterval.Month },
						},
					},
				],
			},
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyMessages({ included: 200 })],
		});
		await autumnV2_3.licenses.attach({
			customer_id: customerId,
			plan_id: license.id,
			entities: [
				{
					entity_id: "license-rebase-snapshot-seat",
					name: "Snapshot Seat",
					feature_id: TestFeature.Users,
				},
			],
		});
		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			"license-rebase-snapshot-seat",
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Messages,
			granted: 100,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: non-customized catalog links continue inheriting without refs")}`,
	async () => {
		const parent = products.base({
			id: "license-rebase-inherited-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-rebase-inherited-seat",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			customerId: "license-rebase-inherited",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [parent, license] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: license.id,
					included: 0,
				}),
			],
		});

		await autumnV2_2.post("/plans.update", {
			plan_id: license.id,
			items: [itemsV2.monthlyWords({ included: 75 })],
		});
		const link = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			licensePlanId: license.id,
		});

		expect(link.planLicense.customized).toBe(false);
		expect(link.items.entitlements).toHaveLength(0);
		expect(link.items.prices).toHaveLength(0);
		expect(link.fullLicenseProduct.entitlements).toEqual([
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 75,
			}),
		]);
	},
);
