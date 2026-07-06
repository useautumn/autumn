/**
 * TDD test for pooled grants when a scheduled paid downgrade target with a
 * pooled license activates at cycle end and the expiring plan had no pools.
 *
 * Red-failure mode (current behavior):
 *  - activateScheduledCustomerProduct flips Scheduled -> Active with no
 *    license hook, and transitionLicenseAssignmentsForParents early-returns
 *    because the expiring plan had no pools — so the activated plan's pooled
 *    grant is never created and customer-level check stays denied until a
 *    lazy license read.
 *
 * Green-success criteria (after fix):
 *  - Activating a license-bearing parent eagerly ensures its pools and
 *    reconciles pooled grants; check shows allowance x capacity immediately.
 */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	type LicensePoolResponse,
	ProductCatalogType,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: pooled grant created when scheduled downgrade with pooled license activates")}`,
	async () => {
		const premium = products.premium({
			id: "lic-act-premium",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "lic-act-pro",
			items: [items.dashboard()],
		});
		const license = {
			...products.base({
				id: "lic-act-seat",
				items: [items.monthlyMessages({ includedUsage: 25 })],
			}),
			catalog_type: ProductCatalogType.License,
		};

		const { customerId, autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "lic-successor-activation",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [premium, pro, license] }),
				],
				actions: [s.billing.attach({ productId: premium.id })],
			});

		await autumnV2_2.post("/licenses.set_plan_license", {
			parent_plan_id: pro.id,
			license_plan_id: license.id,
			included_quantity: 2,
			pooled_feature_ids: [TestFeature.Messages],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduledCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(scheduledCheck.allowed).toBe(false);

		await timeout(4000);
		expect(testClockId).toBeTruthy();
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			advanceTo: addMonths(new Date(advancedTo ?? Date.now()), 1).getTime(),
			waitForSeconds: 30,
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId as string,
			numberOfHours: hoursToFinalizeInvoice,
			startingFrom: addMonths(new Date(advancedTo ?? Date.now()), 1),
			waitForSeconds: 30,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance?.remaining).toBe(50);

		const pools = (await autumnV2_2.post("/licenses.list_pools", {
			customer_id: customerId,
		})) as { list: LicensePoolResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0].inventory).toMatchObject({
			included_quantity: 2,
			assigned: 0,
			available: 2,
		});
	},
);
