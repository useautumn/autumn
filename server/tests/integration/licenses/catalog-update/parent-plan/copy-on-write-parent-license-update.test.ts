/** Contract: parent-only versioning copies the license link's content (uncustomized) to v2's own
 * row; customizing v2 later marks it customized. V1, the original link, and its customer's pool
 * and effective definition remain unchanged. Each version owns its own plan_license row (the FK is
 * version-scoped), so ids always differ across versions — content equality is what "unchanged" means. */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	CustomerExpand,
	planLicenses,
	productToBasePrice,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerLicenses } from "@tests/integration/licenses/utils/expectCustomerLicenses.js";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";
import { buildCustomizedLicenseEntry } from "../utils/buildCustomizedLicenseEntry.js";

const BASE_PRICE = 20;
const BASE_MESSAGES = 25;
const CUSTOM_PRICE = 40;
const CUSTOM_MESSAGES = 50;

test.concurrent(
	`${chalk.yellowBright("plans.update: unchanged license links fork only when v2 customizes them")}`,
	async () => {
		const customerId = "license-parent-link-copy-on-write";
		const parent = products.base({
			id: "license-copy-on-write-parent",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "license-copy-on-write-child",
			items: [
				items.monthlyPrice({ price: BASE_PRICE }),
				items.monthlyMessages({ includedUsage: BASE_MESSAGES }),
			],
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

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: license.id, quantity: 1 }],
		});

		const v1Before = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: parent.id,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 1,
		});
		const originalLink = v1Before.licenses?.[0];
		expect(originalLink).toMatchObject({
			included: 0,
			is_custom: false,
			customized: false,
		});
		if (!originalLink) throw new Error("Parent v1 has no license link");

		const originalRow = await ctx.db.query.planLicenses.findFirst({
			where: eq(planLicenses.id, originalLink.id),
		});
		expect(originalRow).toBeDefined();
		const customerBefore = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: false,
			basePrice: { amount: BASE_PRICE, interval: BillingInterval.Month },
		});
		expect(customerBefore.plan_license_id).toBe(originalLink.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			items: [
				{ feature_id: TestFeature.Dashboard },
				{
					feature_id: TestFeature.Words,
					included: 100,
					reset: { interval: ResetInterval.Month },
				},
			],
		});

		const [v1AfterParentUpdate, v2BeforeCustomize, originalRowAfterVersion] =
			await Promise.all([
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 1,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 2,
				}),
				ctx.db.query.planLicenses.findFirst({
					where: eq(planLicenses.id, originalLink.id),
				}),
			]);

		expect(v2BeforeCustomize.internal_id).not.toBe(
			v1AfterParentUpdate.internal_id,
		);
		expect(v2BeforeCustomize.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Words,
				allowance: 100,
			}),
		);
		expect(v1AfterParentUpdate.licenses?.[0]?.id).toBe(originalLink.id);
		// v2 owns its own row (version-scoped FK) but carries the same content forward.
		expect(v2BeforeCustomize.licenses?.[0]?.id).not.toBe(originalLink.id);
		expect(v2BeforeCustomize.licenses?.[0]).toMatchObject({
			is_custom: false,
			customized: false,
			included: originalLink.included,
		});
		expect(originalRowAfterVersion).toEqual(originalRow);

		const customerAfterVersion = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: false,
			basePrice: { amount: BASE_PRICE, interval: BillingInterval.Month },
		});
		expect(customerAfterVersion.id).toBe(customerBefore.id);
		expect(customerAfterVersion.link_id).toBe(customerBefore.link_id);
		expect(customerAfterVersion.plan_license_id).toBe(originalLink.id);

		await autumnV2_3.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				buildCustomizedLicenseEntry({
					licensePlanId: license.id,
					price: CUSTOM_PRICE,
					messages: CUSTOM_MESSAGES,
				}),
			],
		});

		const [parentVersions, v1Final, v2Final, originalRowFinal] =
			await Promise.all([
				ProductService.listFull({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
					inIds: [parent.id],
					returnAll: true,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 1,
				}),
				ProductService.getFull({
					db: ctx.db,
					idOrInternalId: parent.id,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 2,
				}),
				ctx.db.query.planLicenses.findFirst({
					where: eq(planLicenses.id, originalLink.id),
				}),
			]);

		expect(parentVersions.map((version) => version.version).sort()).toEqual([
			1, 2,
		]);
		expect(v1Final.licenses?.[0]?.id).toBe(originalLink.id);
		expect(v2Final.licenses?.[0]).toMatchObject({
			is_custom: false,
			customized: true,
		});
		expect(v2Final.licenses?.[0]?.id).not.toBe(originalLink.id);
		expect(originalRowFinal).toEqual(originalRow);

		const v1License = v1Final.licenses?.[0]?.product;
		const v2License = v2Final.licenses?.[0]?.product;
		expect(
			v1License && productToBasePrice({ product: v1License }),
		).toMatchObject({
			config: { amount: BASE_PRICE, interval: BillingInterval.Month },
		});
		expect(v1License?.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: BASE_MESSAGES,
			}),
		);
		expect(
			v2License && productToBasePrice({ product: v2License }),
		).toMatchObject({
			config: { amount: CUSTOM_PRICE, interval: BillingInterval.Month },
		});
		expect(v2License?.entitlements).toContainEqual(
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				allowance: CUSTOM_MESSAGES,
			}),
		);

		const customerFinal = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ expand: [CustomerExpand.SubscriptionsPlan] },
		);
		expect(customerFinal.subscriptions).toContainEqual(
			expect.objectContaining({
				plan_id: parent.id,
				status: "active",
				plan: expect.objectContaining({ version: 1 }),
			}),
		);
		expectCustomerLicenses({
			customer: customerFinal,
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
		const customerAfter = await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: false,
			isCustomized: false,
			basePrice: { amount: BASE_PRICE, interval: BillingInterval.Month },
		});
		expect(customerAfter.id).toBe(customerBefore.id);
		expect(customerAfter.link_id).toBe(customerBefore.link_id);
		expect(customerAfter.plan_license_id).toBe(originalLink.id);
		expect(customerAfter.granted).toBe(customerBefore.granted);
		expect(customerAfter.remaining).toBe(customerBefore.remaining);
		expect(customerAfter.paid_quantity).toBe(customerBefore.paid_quantity);
	},
);
