/**
 * Removing a discount that was applied at attach time must not bill anything now.
 * Sent in the dashboard's request shape, which always includes `upsert_licenses: []`.
 *
 * Contract:
 *   7. Preview: nothing due today; the next cycle is billed at full price.
 *   8. Execute: no new invoice is created, and the coupon is gone from Stripe.
 *
 * Red (before):  the empty license list routed to a plan update, crediting the
 *                discounted payment and re-billing the rest of the cycle at full price.
 * Green (after): an empty `upsert_licenses` is a no-op, so only the discount changes.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectSubscriptionDiscountsCorrect } from "@tests/integration/billing/utils/discounts/expectSubscriptionDiscountsCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("remove-discount 7: removing an attach-time discount from the dashboard charges nothing now")}`,
	async () => {
		const customerId = "remove-disc-attached";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const launch = await createPercentCoupon({
			stripeCli: ctx.stripeCli,
			percentOff: 50,
		});
		await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			discounts: [{ reward_id: launch.id }],
		});
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestTotal: 10,
		});

		const dashboardRemoval: UpdateSubscriptionV0Params = {
			customer_id: customerId,
			product_id: pro.id,
			upsert_licenses: [],
			remove_discounts: [{ reward_id: launch.id }],
		};

		const preview = (await autumnV1.subscriptions.previewUpdate(
			dashboardRemoval,
		)) as PreviewUpdateSubscriptionResponse;
		expect(preview.total).toBe(0);
		expect(preview.next_cycle?.total).toBe(20);

		await autumnV1.subscriptions.update(dashboardRemoval);

		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestTotal: 10,
		});
	},
	300_000,
);
