/**
 * RevenueCat PRODUCT_CHANGE: a Google Play replacement ends the old subscription immediately,
 * even when the new plan is bought from another app user. The old holder must lose the plan.
 */

import { expect, test } from "bun:test";
import { customerProducts } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";
import {
	findActiveCusProduct,
	mapProduct,
	mockProduct,
	mockSubscription,
	newRcClient,
	purchaseOnA,
	rcPlan,
	setupCustomers,
} from "./utils/revenue-cat-transfer-test-utils";
import { expectWebhookSuccess } from "./utils/revenue-cat-webhook-client";

const setupReplacement = async ({ customerA }: { customerA: string }) => {
	const oldPlan = rcPlan({ id: `${customerA}-premium` });
	const newPlan = rcPlan({ id: `${customerA}-max` });
	await setupCustomers({ customerId: customerA, plans: [oldPlan, newPlan] });

	const oldStoreId = `com.app.${customerA}.premium`;
	const newStoreId = `com.app.${customerA}.max`;
	await mapProduct({
		autumnProductId: oldPlan.id,
		revenuecatProductId: oldStoreId,
	});
	await mapProduct({
		autumnProductId: newPlan.id,
		revenuecatProductId: newStoreId,
	});

	const originalTransactionId = `GPA.${customerA}.${Date.now()}`;
	expectWebhookSuccess(
		await newRcClient().initialPurchase({
			productId: oldStoreId,
			appUserId: customerA,
			originalTransactionId,
			purchasedAtMs: Date.now() - 60_000,
			expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 30,
			mock: {
				products: [
					mockProduct({ internalId: `prod_${customerA}`, storeId: oldStoreId }),
				],
				subscriptions: [
					mockSubscription({
						id: `sub_${customerA}`,
						internalProductId: `prod_${customerA}`,
					}),
				],
				purchases: [],
			},
		}),
	);
	expect(
		await findActiveCusProduct({
			customerId: customerA,
			autumnProductId: oldPlan.id,
		}),
	).toBeDefined();

	return { oldPlan, newPlan, oldStoreId, newStoreId, originalTransactionId };
};

test.concurrent(
	`${chalk.yellowBright("rc product change: replacement bought by another app user expires the old holder's plan")}`,
	async () => {
		const customerA = "rc-pc-cross";
		const customerB = `${customerA}-b`;
		const { oldPlan, newPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: customerB,
				originalTransactionId,
				expirationAtMs: Date.now() - 1,
			}),
		);
		expectWebhookSuccess(
			await newRcClient().initialPurchase({
				productId: newStoreId,
				appUserId: customerB,
				price: 0,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeUndefined();
		expect(
			await findActiveCusProduct({
				customerId: customerB,
				autumnProductId: newPlan.id,
			}),
		).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: deferred change keeps the current plan until it ends")}`,
	async () => {
		const customerA = "rc-pc-deferred";
		const { oldPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: customerA,
				originalTransactionId,
				expirationAtMs: Date.now() + 1000 * 60 * 60 * 24 * 7,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: webhook a few minutes before the end still expires the plan")}`,
	async () => {
		const customerA = "rc-pc-early";
		const { oldPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: `${customerA}-b`,
				originalTransactionId,
				expirationAtMs: Date.now() + 1000 * 60 * 2,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: follows a purchase transferred to another customer")}`,
	async () => {
		const customerA = "rc-pc-xfer";
		const customerB = `${customerA}-b`;
		const plan = rcPlan({ id: `${customerA}-pro` });
		await setupCustomers({ customerId: customerA, plans: [plan] });
		const subId = `sub_${customerA}`;
		const rcStoreId = `com.app.${customerA}`;
		const { mock } = await purchaseOnA({
			plan,
			rcStoreId,
			rcInternalId: `prod_${customerA}`,
			subId,
			customerId: customerA,
		});

		expectWebhookSuccess(
			await newRcClient().transfer({
				transferredFrom: [customerA],
				transferredTo: [customerB],
				mock,
			}),
		);
		expect(
			await findActiveCusProduct({
				customerId: customerB,
				autumnProductId: plan.id,
			}),
		).toBeDefined();

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: rcStoreId,
				newProductId: `${rcStoreId}.max`,
				appUserId: `${customerA}-c`,
				originalTransactionId: `tx_${subId}`,
				expirationAtMs: Date.now() - 1,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerB,
				autumnProductId: plan.id,
			}),
		).toBeUndefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: App Store changes are left to RENEWAL")}`,
	async () => {
		const customerA = "rc-pc-appstore";
		const { oldPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: customerA,
				originalTransactionId,
				expirationAtMs: Date.now() - 1,
				store: "APP_STORE",
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: an event older than the plan's current period is ignored")}`,
	async () => {
		const customerA = "rc-pc-stale";
		const { oldPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });
		const beforePurchase = Date.now() - 1000 * 60 * 60;

		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: `${customerA}-b`,
				originalTransactionId,
				expirationAtMs: beforePurchase,
				eventTimestampMs: beforePurchase,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeDefined();
	},
);

test.concurrent(
	`${chalk.yellowBright("rc product change: a retried INITIAL_PURCHASE restores a missing purchase id")}`,
	async () => {
		const customerA = "rc-pc-retry";
		const { oldPlan, oldStoreId, newStoreId, originalTransactionId } =
			await setupReplacement({ customerA });
		const plan = await findActiveCusProduct({
			customerId: customerA,
			autumnProductId: oldPlan.id,
		});
		await ctx.db
			.update(customerProducts)
			.set({
				processor: sql`${customerProducts.processor} - 'original_transaction_id'`,
			})
			.where(eq(customerProducts.id, plan?.id ?? ""));

		await newRcClient().initialPurchase({
			productId: oldStoreId,
			appUserId: customerA,
			originalTransactionId,
		});
		expectWebhookSuccess(
			await newRcClient().productChange({
				productId: oldStoreId,
				newProductId: newStoreId,
				appUserId: `${customerA}-b`,
				originalTransactionId,
				expirationAtMs: Date.now() - 1,
			}),
		);

		expect(
			await findActiveCusProduct({
				customerId: customerA,
				autumnProductId: oldPlan.id,
			}),
		).toBeUndefined();
	},
);
