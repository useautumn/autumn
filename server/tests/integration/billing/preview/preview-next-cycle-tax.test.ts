/**
 * TDD tests for next_cycle tax on billing previews (flim-ai report).
 * next_cycle.total previously excluded tax even though its docstring says
 * "after discounts and tax", so previews disagreed with the renewal invoice.
 *
 * Red-failure mode (pre-fix):
 *  - next_cycle.total = post-discount subtotal only
 *    (34.90 plan, 50% once coupon, 20% VAT -> 17.45 instead of 20.94).
 *
 * Green-success criteria (post-fix):
 *  - next_cycle.total includes exclusive tax, mirroring the top-level
 *    total contract.
 */

import { expect, test } from "bun:test";
import type { PreviewUpdateSubscriptionResponse } from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// flim parity: 34.90 base, 50% once coupon, 20% exclusive VAT -> 20.94.
test.concurrent(
	`${chalk.yellowBright("preview-next-cycle-tax 1: tax_rate_id + once discount -> next_cycle.total includes VAT")}`,
	async () => {
		const customerId = "preview-next-cycle-tax-disc";

		const pro = products.base({
			id: "pro",
			items: [items.monthlyPrice({ price: 34.9 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "VAT",
			percentage: 20,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			tax_rate_id: taxRate.id,
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			duration: "once",
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.total).toBe(0);
		expect(preview.next_cycle, "next_cycle should be defined").toBeDefined();
		const nextCycle = preview.next_cycle!;

		// 34.90 - 50% = 17.45, + 20% VAT = 20.94.
		expect(nextCycle.subtotal).toBe(34.9);
		expect(nextCycle.total).toBe(20.94);
	},
);

test.concurrent(
	`${chalk.yellowBright("preview-next-cycle-tax 2: tax_rate_id without discount -> plain renewal taxed")}`,
	async () => {
		const customerId = "preview-next-cycle-tax-plain";

		const pro = products.base({
			id: "pro",
			items: [items.monthlyPrice({ price: 20 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "VAT",
			percentage: 10,
			inclusive: false,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			tax_rate_id: taxRate.id,
		});

		const coupon = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
			duration: "forever",
		});

		const preview = (await autumnV1.subscriptions.previewUpdate({
			customer_id: customerId,
			product_id: pro.id,
			discounts: [{ reward_id: coupon.id }],
		})) as PreviewUpdateSubscriptionResponse;

		expect(preview.next_cycle, "next_cycle should be defined").toBeDefined();
		const nextCycle = preview.next_cycle!;

		// 20 - 50% = 10, + 10% VAT = 11.
		expect(nextCycle.subtotal).toBe(20);
		expect(nextCycle.total).toBe(11);
	},
);
