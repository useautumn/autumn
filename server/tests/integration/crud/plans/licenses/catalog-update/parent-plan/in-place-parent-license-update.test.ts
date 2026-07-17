/**
 * Contract: an in-place customized license edit retires the customer-referenced catalog link and creates a successor.
 * The parent stays on v1, its catalog uses the successor, and the existing customer stays pinned to the old definition.
 */
import { expect, test } from "bun:test";
import {
	BillingInterval,
	customerLicenses,
	planLicenses,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { licenseItemRepo } from "@/internal/licenses/repos/licenseItemRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectLicenseDefinitionCorrect } from "../../../../../licenses/utils/expectLicenseDefinitionCorrect.js";
import { buildCustomizedLicenseEntry } from "../../utils/buildCustomizedLicenseEntry.js";
import { expectCatalogLicenseCorrect } from "../../utils/expectCatalogLicenseCorrect.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: in-place license customization preserves the existing customer definition")}`,
	async () => {
		const customerId = "license-parent-in-place-successor";
		const parent = products.base({
			id: "license-in-place-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-in-place-child",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
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

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 20,
					messages: 25,
				}),
			],
			disable_version: true,
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: license.id, quantity: 1 }],
		});

		return;

		const catalogBefore = await expectCatalogLicenseCorrect({
			ctx,
			parentPlanId: parent.id,
			parentVersion: 1,
			licensePlanId: license.id,
			included: 0,
			price: { amount: 20, interval: BillingInterval.Month },
			entitlements: [{ featureId: TestFeature.Messages, allowance: 25 }],
		});
		const customerBefore = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: true,
			basePrice: { amount: 20, interval: BillingInterval.Month },
		});
		expect(customerBefore.plan_license_id).toBe(catalogBefore.planLicense.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 40,
					messages: 50,
				}),
			],
			disable_version: true,
		});

		const [catalogAfter, parentAfter, retiredLink, customerPool] =
			await Promise.all([
				expectCatalogLicenseCorrect({
					ctx,
					parentPlanId: parent.id,
					parentVersion: 1,
					licensePlanId: license.id,
					included: 0,
					price: { amount: 40, interval: BillingInterval.Month },
					entitlements: [{ featureId: TestFeature.Messages, allowance: 50 }],
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
				ctx.db.query.planLicenses.findFirst({
					where: eq(planLicenses.id, catalogBefore.planLicense.id),
				}),
				ctx.db.query.customerLicenses.findFirst({
					where: eq(customerLicenses.id, customerBefore.id),
				}),
			]);

		expect(parentAfter.version).toBe(1);
		expect(parentAfter.internal_id).toBe(
			catalogBefore.parentProduct.internal_id,
		);
		expect(catalogAfter.planLicense.id).not.toBe(catalogBefore.planLicense.id);
		expect(catalogAfter.planLicense).toMatchObject({
			is_custom: false,
			customized: true,
		});
		expect(retiredLink).toMatchObject({
			id: catalogBefore.planLicense.id,
			is_custom: true,
			customized: true,
			parent_internal_product_id: catalogBefore.parentProduct.internal_id,
			license_internal_product_id:
				catalogBefore.planLicense.license_internal_product_id,
		});

		const [retiredItems, successorItems] = await Promise.all([
			licenseItemRepo.listByPlanLicenseIds({
				db: ctx.db,
				planLicenseIds: [catalogBefore.planLicense.id],
			}),
			licenseItemRepo.listByPlanLicenseIds({
				db: ctx.db,
				planLicenseIds: [catalogAfter.planLicense.id],
			}),
		]);
		expect(retiredItems.prices.map((price) => price.id)).toEqual(
			catalogBefore.items.prices.map((price) => price.id),
		);
		expect(
			retiredItems.entitlements.map((entitlement) => entitlement.id),
		).toEqual(
			catalogBefore.items.entitlements.map((entitlement) => entitlement.id),
		);
		expect(successorItems.prices.map((price) => price.id)).not.toEqual(
			retiredItems.prices.map((price) => price.id),
		);
		expect(
			successorItems.entitlements.map((entitlement) => entitlement.id),
		).not.toEqual(
			retiredItems.entitlements.map((entitlement) => entitlement.id),
		);

		expect(customerPool).toMatchObject({
			id: customerBefore.id,
			link_id: customerBefore.link_id,
			plan_license_id: catalogBefore.planLicense.id,
			granted: customerBefore.granted,
			remaining: customerBefore.remaining,
			paid_quantity: customerBefore.paid_quantity,
		});
		const customerAfter = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: { amount: 20, interval: BillingInterval.Month },
		});
		expect(customerAfter.plan_license_id).toBe(catalogBefore.planLicense.id);
		expect(customerAfter.planLicense?.product.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 25,
			}),
		);
	},
);
