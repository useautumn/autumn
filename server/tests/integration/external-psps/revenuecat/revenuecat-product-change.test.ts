/**
 * RevenueCat PRODUCT_CHANGE: a Google Play replacement ends the old subscription immediately,
 * even when the new plan is bought from another app user. The old holder must lose the plan.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import {
	findActiveCusProduct,
	mapProduct,
	mockProduct,
	mockSubscription,
	newRcClient,
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
