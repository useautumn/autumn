/** Contract: a customized license edit auto-versions a parent with customers without force_version.
 * V1 and its customer pool stay pinned; V2 gets an independent link and changed custom rows on the same child. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	CustomerExpand,
	productToBasePrice,
} from "@autumn/shared";
import { listLicenseAssignments } from "@tests/integration/licenses/licenseTestUtils.js";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses.js";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { buildProductDataCatalogLicenses } from "@/internal/products/internalHandlers/buildProductDataCatalogLicenses.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import { buildCustomizedLicenseEntry } from "../utils/buildCustomizedLicenseEntry.js";
import { expectCatalogLicenseCorrect } from "../utils/expectCatalogLicenseCorrect.js";

test.concurrent(
	`${chalk.yellowBright("plans.update: license customization automatically versions a parent with customers")}`,
	async () => {
		const customerId = "license-parent-auto-version";
		const parent = products.base({
			id: "license-auto-version-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-auto-version-child",
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

		const v1Entry = buildCustomizedLicenseEntry({
			licensePlanId: license.id,
			price: 20,
			messages: 25,
		});
		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [v1Entry],
			disable_version: true,
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: license.id, quantity: 1 }],
		});

		const v1Before = await expectCatalogLicenseCorrect({
			ctx,
			parentPlanId: parent.id,
			parentVersion: 1,
			licensePlanId: license.id,
			included: 0,
			price: { amount: 20, interval: BillingInterval.Month },
			entitlements: [{ featureId: TestFeature.Messages, allowance: 25 }],
		});
		const customerLicenseBefore = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: true,
			basePrice: { amount: 20, interval: BillingInterval.Month },
		});
		expect(customerLicenseBefore.plan_license_id).toBe(v1Before.planLicense.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: 40,
					messages: 50,
				}),
			],
		});

		const [v1After, v2, stockLicense] = await Promise.all([
			expectCatalogLicenseCorrect({
				ctx,
				parentPlanId: parent.id,
				parentVersion: 1,
				licensePlanId: license.id,
				included: 0,
				price: { amount: 20, interval: BillingInterval.Month },
				entitlements: [{ featureId: TestFeature.Messages, allowance: 25 }],
			}),
			expectCatalogLicenseCorrect({
				ctx,
				parentPlanId: parent.id,
				parentVersion: 2,
				licensePlanId: license.id,
				included: 0,
				price: { amount: 40, interval: BillingInterval.Month },
				entitlements: [{ featureId: TestFeature.Messages, allowance: 50 }],
			}),
			ProductService.getFull({
				db: ctx.db,
				idOrInternalId: license.id,
				orgId: ctx.org.id,
				env: ctx.env,
			}),
		]);

		expect(v2.parentProduct.internal_id).not.toBe(
			v1After.parentProduct.internal_id,
		);
		expect(v2.planLicense.id).not.toBe(v1After.planLicense.id);
		expect(v1After.planLicense.id).toBe(v1Before.planLicense.id);
		expect(v1After.planLicense.license_internal_product_id).toBe(
			v2.planLicense.license_internal_product_id,
		);
		expect(v2.planLicense.license_internal_product_id).toBe(
			stockLicense.internal_id,
		);

		const [v1Plan, v2Plan] = await Promise.all([
			getPlanResponse({
				ctx,
				product: v1After.parentProduct,
				features: ctx.features,
			}),
			getPlanResponse({
				ctx,
				product: v2.parentProduct,
				features: ctx.features,
			}),
		]);
		const [v1ProductDataLicense] = buildProductDataCatalogLicenses({
			product: v1After.parentProduct,
			apiLicenses: v1Plan.licenses,
			features: ctx.features,
		});
		const [v2ProductDataLicense] = buildProductDataCatalogLicenses({
			product: v2.parentProduct,
			apiLicenses: v2Plan.licenses,
			features: ctx.features,
		});
		expect(v1ProductDataLicense?.planLicense.id).toBe(v1After.planLicense.id);
		expect(v2ProductDataLicense?.planLicense.id).toBe(v2.planLicense.id);
		expect(v1ProductDataLicense?.license.version).toBe(1);
		expect(v2ProductDataLicense?.license.version).toBe(1);
		expect(v1ProductDataLicense?.planLicense.customize).toEqual(
			v1Plan.licenses?.[0]?.customize,
		);
		expect(v2ProductDataLicense?.planLicense.customize).toEqual(
			v2Plan.licenses?.[0]?.customize,
		);
		expect(v1ProductDataLicense?.planLicense.customize).not.toEqual(
			v2ProductDataLicense?.planLicense.customize,
		);

		expect(v1After.priceRefs.map((row) => row.id)).toEqual(
			v1Before.priceRefs.map((row) => row.id),
		);
		expect(v1After.entitlementRefs.map((row) => row.id)).toEqual(
			v1Before.entitlementRefs.map((row) => row.id),
		);
		expect(v2.priceRefs.map((row) => row.id)).not.toEqual(
			v1After.priceRefs.map((row) => row.id),
		);
		expect(v2.entitlementRefs.map((row) => row.id)).not.toEqual(
			v1After.entitlementRefs.map((row) => row.id),
		);
		expect(v1After.priceRefs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					plan_license_id: v1After.planLicense.id,
				}),
			]),
		);
		expect(v1After.entitlementRefs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					plan_license_id: v1After.planLicense.id,
				}),
			]),
		);
		expect(v2.priceRefs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ plan_license_id: v2.planLicense.id }),
			]),
		);
		expect(v2.entitlementRefs).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ plan_license_id: v2.planLicense.id }),
			]),
		);

		expect(productToBasePrice({ product: stockLicense })).toBeNull();
		expect(stockLicense.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 10,
			}),
		);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			expand: [CustomerExpand.SubscriptionsPlan],
		});
		const parentSubscription = customer.subscriptions.find(
			(subscription) => subscription.plan_id === parent.id,
		);
		expect(parentSubscription?.status).toBe("active");
		expect(parentSubscription?.plan?.version).toBe(1);
		expectCustomerLicenses({
			customer,
			count: 1,
			licenses: [
				{
					license_plan_id: license.id,
					parent_plan_id: parent.id,
					granted: 1,
					usage: 0,
					remaining: 1,
					paid_quantity: 1,
				},
			],
		});
		const assignments = await listLicenseAssignments({
			autumn: autumnV2_3,
			customerId,
			licensePlanId: license.id,
		});
		expect(assignments).toHaveLength(0);

		const customerLicenseAfter = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: true,
			basePrice: { amount: 20, interval: BillingInterval.Month },
		});
		expect(customerLicenseAfter.id).toBe(customerLicenseBefore.id);
		expect(customerLicenseAfter.plan_license_id).toBe(v1After.planLicense.id);
		expect(
			customerLicenseAfter.planLicense?.product.entitlements,
		).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: 25,
			}),
		);
	},
);
