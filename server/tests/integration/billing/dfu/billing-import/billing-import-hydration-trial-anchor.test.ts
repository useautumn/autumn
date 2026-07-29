/**
 * dfu.flash hydration — trial_ends_at + billing_cycle_anchor hydrated from the
 * real Stripe subscription's trial_end / current_period_end.
 */

import { expect, test } from "bun:test";
import {
	getAllStripePriceIds,
} from "@tests/integration/billing/sync/utils/syncTestUtils.js";
import {
	type FlashClient,
	callFlash,
	getFlashedCustomerProduct,
} from "@tests/integration/billing/dfu/billing-import/utils/flashTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("dfu.flash: trial + anchor hydrated from Stripe current_period_end")}`,
	async () => {
		const customerId = "dfu-flash-hydrate-trial";
		const pro = products.pro({
			id: "dfu-hydrate-trial-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const priceIds = getAllStripePriceIds({ fullProduct });
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const sub = await ctx.stripeCli.subscriptions.create({
			customer: fullCustomer.processor?.id as string,
			items: priceIds.map((price) => ({ price })),
			trial_period_days: 14,
		});
		const expectedTrialEndsAt = (sub.trial_end ?? 0) * 1000;
		const expectedPeriodEndMs = sub.items.data[0].current_period_end * 1000;

		const payload = {
			customer_id: customerId,
			processors: [{ type: "stripe", id: sub.customer as string }],
			billables: [
				{
					processor: "stripe",
					link: { subscription_id: sub.id },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				},
			],
		};

		await callFlash(autumnV2_2 as FlashClient, payload);

		const cusProduct = await getFlashedCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(cusProduct?.trial_ends_at).toBe(expectedTrialEndsAt);
		expect(cusProduct?.billing_cycle_anchor).toBe(expectedPeriodEndMs);
	},
);
