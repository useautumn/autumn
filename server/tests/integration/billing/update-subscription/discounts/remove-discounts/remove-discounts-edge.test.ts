/**
 * Edge cases for `{ action: "remove", reward_id }` on `billing.update`.
 *
 * Contract:
 *   4. Removing a coupon already removed in Stripe is a no-op; the rest of the update applies.
 *   5. Preview reflects the removal: the next cycle is billed at full price.
 *   6. With a scheduled downgrade, the removal survives the phase transition.
 *
 * Red (before):  `action` is stripped, so removals are treated as additions.
 * Green (after): removals are resolved against the live subscription and schedule.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectSubscriptionDiscountsCorrect } from "@tests/integration/billing/utils/discounts/expectSubscriptionDiscountsCorrect.js";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductScheduled } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const billingUnits = 100;

test.concurrent(
	`${chalk.yellowBright("remove-discount 4: coupon already removed in Stripe does not block a quantity change")}`,
	async () => {
		const customerId = "remove-disc-already-gone";
		const prepaid = products.base({
			id: "prepaid",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits,
					price: 10,
				}),
			],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaid] }),
			],
			actions: [
				s.billing.attach({
					productId: prepaid.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 5 * billingUnits },
					],
				}),
			],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 50 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});
		// A teammate removes it directly in Stripe; an empty array would be a no-op.
		await stripeCli.subscriptions.update(subscription.id, { discounts: "" });
		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: prepaid.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
			],
			discounts: [{ action: "remove", reward_id: launch.id }],
		});

		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });
		await expectCustomerFeatureCorrect({
			customerId,
			featureId: TestFeature.Messages,
			balance: 10 * billingUnits,
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("remove-discount 5: preview bills the next cycle at full price")}`,
	async () => {
		const customerId = "remove-disc-preview";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 50 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		const preview =
			await autumnV2_4.billing.previewUpdate<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				discounts: [{ action: "remove", reward_id: launch.id }],
			});
		const { total, next_cycle } = preview as PreviewUpdateSubscriptionResponse;

		expect(total).toBe(0);
		expect(next_cycle?.total).toBe(20);
		await expectSubscriptionDiscountsCorrect({
			customerId,
			couponIds: [launch.id],
		});
	},
	300_000,
);

test.concurrent(
	`${chalk.yellowBright("remove-discount 6: removal survives a scheduled downgrade")}`,
	async () => {
		const customerId = "remove-disc-scheduled";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_4, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: true, paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.billing.attach({ productId: premium.id })],
			});

		const { stripeCli, subscription } = await getStripeSubscription({
			customerId,
		});
		const launch = await createPercentCoupon({ stripeCli, percentOff: 20 });
		await applySubscriptionDiscount({
			stripeCli,
			subscriptionId: subscription.id,
			couponIds: [launch.id],
		});

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			redirect_mode: "if_required",
		});
		await expectProductScheduled({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			productId: pro.id,
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: premium.id,
			discounts: [{ action: "remove", reward_id: launch.id }],
		});
		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			currentEpochMs: advancedTo,
			withPause: true,
		});

		await expectSubscriptionDiscountsCorrect({ customerId, couponIds: [] });
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 2,
			latestTotal: 20,
		});
	},
	300_000,
);
