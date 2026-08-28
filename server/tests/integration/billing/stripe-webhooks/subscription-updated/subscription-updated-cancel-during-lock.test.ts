/**
 * Portal / period-end cancel must register even while the Stripe subscription
 * lock from a just-finished Autumn attach or updateSubscription is still held.
 *
 * Red (current):  `if (lock) return` drops any cancel/delete webhook for 60s.
 * Green (after):  skip only Autumn-originated echoes; portal + clock cancels land.
 */

import { test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const messagesItem = items.monthlyMessages({ includedUsage: 100 });

const cancelAtPeriodEndViaStripe = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId,
	});
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		cancel_at_period_end: true,
	});
};

test.concurrent(
	`${chalk.yellowBright("sub.updated: portal cancel right after upgrade attach registers")}`,
	async () => {
		const customerId = "lock-portal-after-attach";
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});
		const premium = products.premium({
			id: "premium",
			items: [messagesItem],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		await cancelAtPeriodEndViaStripe({
			ctx,
			customerId,
			productId: premium.id,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			canceling: [premium.id],
			scheduled: [free.id],
		});
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);

test.concurrent(
	`${chalk.yellowBright("sub.updated: portal cancel right after updateSubscription registers")}`,
	async () => {
		const customerId = "lock-portal-after-update";
		const prepaidItem = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [prepaidItem],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});

		await cancelAtPeriodEndViaStripe({
			ctx,
			customerId,
			productId: pro.id,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			canceling: [pro.id],
			scheduled: [free.id],
		});
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);

test.concurrent(
	`${chalk.yellowBright("sub.updated: cancel EOC then advance clock expires while lock is held")}`,
	async () => {
		const customerId = "lock-eoc-advance";
		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const { autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			cancel_action: "cancel_end_of_cycle",
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			canceling: [pro.id],
			scheduled: [free.id],
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [free.id],
			notPresent: [pro.id],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
	{ timeout: WEBHOOK_TEST_TIMEOUT_MS },
);
