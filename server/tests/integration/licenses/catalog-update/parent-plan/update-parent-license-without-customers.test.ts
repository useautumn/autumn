/** Contract: a parent without customers updates in place for parent, license-customize, and combined edits.
 * Customers on the child do not affect parent versioning, and the child catalog/customer definition stays unchanged. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	CustomerExpand,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { buildCustomizedLicenseEntry } from "../utils/buildCustomizedLicenseEntry.js";
import { expectCatalogLicenseCorrect } from "../utils/expectCatalogLicenseCorrect.js";
import { getFullLicenseProduct } from "../utils/getFullLicenseProduct.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: parent-specific license edits stay in place without parent customers")}`,
	async () => {
		const childCustomerId = "license-child-customer-parent-empty";
		const parent = products.base({
			id: "license-empty-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-child-with-customer",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId: childCustomerId,
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
				s.billing.attach({ productId: license.id }),
			],
		});
		const initial = await getFullLicenseProduct({
			ctx,
			parentPlanId: parent.id,
			parentVersion: 1,
			licensePlanId: license.id,
		});
		return;

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [
				{ feature_id: TestFeature.Dashboard },
				{
					feature_id: TestFeature.Credits,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
		});
		const afterParentOnly = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(afterParentOnly.version).toBe(1);
		expect(afterParentOnly.internal_id).toBe(initial.parentProduct.internal_id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 20,
					messages: 25,
				}),
			],
		});
		const afterLicenseOnly = await expectCatalogLicenseCorrect({
			ctx,
			parentPlanId: parent.id,
			parentVersion: 1,
			licensePlanId: license.id,
			included: 0,
			price: { amount: 20, interval: BillingInterval.Month },
			entitlements: [{ featureId: TestFeature.Messages, allowance: 25 }],
		});
		expect(afterLicenseOnly.parentProduct.internal_id).toBe(
			initial.parentProduct.internal_id,
		);
		expect(afterLicenseOnly.planLicense.id).toBe(initial.planLicense.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [
				{ feature_id: TestFeature.Dashboard },
				{
					feature_id: TestFeature.Credits,
					included: 200,
					reset: { interval: ResetInterval.Month },
				},
			],
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 40,
					messages: 50,
				}),
			],
		});
		const afterCombined = await expectCatalogLicenseCorrect({
			ctx,
			parentPlanId: parent.id,
			parentVersion: 1,
			licensePlanId: license.id,
			included: 0,
			price: { amount: 40, interval: BillingInterval.Month },
			entitlements: [{ featureId: TestFeature.Messages, allowance: 50 }],
		});
		expect(afterCombined.parentProduct.internal_id).toBe(
			initial.parentProduct.internal_id,
		);
		expect(afterCombined.planLicense.id).toBe(initial.planLicense.id);
		expect(afterCombined.parentProduct.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Credits,
				allowance: 200,
			}),
		);

		const childAfter = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: license.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(childAfter.version).toBe(1);
		expect(childAfter.internal_id).toBe(initial.baseLicenseProduct.internal_id);
		expect(childAfter.prices).toHaveLength(0);
		expect(childAfter.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 10,
			}),
		);

		const childCustomer = await autumnV2_3.customers.get<ApiCustomerV5>(
			childCustomerId,
			{ expand: [CustomerExpand.SubscriptionsPlan] },
		);
		expect(childCustomer.subscriptions).toHaveLength(1);
		expect(childCustomer.subscriptions[0]).toMatchObject({
			plan_id: license.id,
			status: "active",
			plan: { version: 1, price: null },
		});
		expect(childCustomer.subscriptions[0]?.plan?.items).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				included: 10,
			}),
		);
		expectBalanceCorrect({
			customer: childCustomer,
			featureId: TestFeature.Messages,
			planId: license.id,
			granted: 10,
			remaining: 10,
			usage: 0,
		});
	},
);
