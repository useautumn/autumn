/**
 * When a scheduled paid downgrade target carries a license link, activating it
 * at cycle end must run the license reconcile hook: the activated parent's
 * pool appears in pools.list with the linked inventory.
 */

import { expect, test } from "bun:test";
import type { LicenseBalanceResponse } from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";

test.concurrent(
	`${chalk.yellowBright("licenses successor activation: pool created when scheduled downgrade with license activates")}`,
	async () => {
		const premium = products.premium({
			id: "lic-act-premium",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "lic-act-pro",
			items: [items.dashboard()],
		});
		const license = products.base({
			id: "lic-act-seat",
			items: [items.monthlyMessages({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, autumnV2_2, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "lic-successor-activation",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [premium, pro, license] }),
				],
				actions: [s.billing.attach({ productId: premium.id })],
			});

		await autumnV2_2.post("/licenses.link", {
			parent_plan_id: pro.id,
			license_plan_id: license.id,
			included: 2,
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});

		const scheduledPools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(scheduledPools.list).toHaveLength(0);

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

		const pools = (await autumnV2_2.post("/licenses.list", {
			customer_id: customerId,
		})) as { list: LicenseBalanceResponse[] };
		expect(pools.list).toHaveLength(1);
		expect(pools.list[0].inventory).toMatchObject({
			included: 2,
			assigned: 0,
			available: 2,
		});
	},
);
