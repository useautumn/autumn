import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";

const billingUnits = 12;

test.concurrent(`${chalk.yellowBright("update-quantity: stripe sync upgrade quantity difference")}`, async () => {
	const customerId = "qty-stripe-sync-upgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.NoProrations,
				},
			}),
		],
	});

	const initialUnits = 5;
	const initialQuantity = initialUnits * billingUnits;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;
	expect(stripeCustomerId).toBeDefined();

	const subscriptionsBefore = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	expect(subscriptionsBefore.data.length).toBeGreaterThan(0);
	const subscription = subscriptionsBefore.data[0];

	const subscriptionItemBefore = subscription.items.data.find(
		(item) => item.quantity !== undefined && item.quantity > 0,
	);
	expect(subscriptionItemBefore).toBeDefined();
	expect(subscriptionItemBefore!.quantity).toBe(initialUnits);

	const updatedUnits = 8;
	const updatedQuantity = updatedUnits * billingUnits;
	const unitsDifference = updatedUnits - initialUnits;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity: updatedQuantity }],
	});

	const subscriptionsAfter = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	const subscriptionAfter = subscriptionsAfter.data[0];
	const subscriptionItemAfter = subscriptionAfter.items.data.find(
		(item) => item.id === subscriptionItemBefore!.id,
	);

	expect(subscriptionItemAfter).toBeDefined();

	expect(subscriptionItemAfter!.quantity).toBe(updatedUnits);

	expect(subscriptionItemAfter!.quantity).toBe(initialUnits + unitsDifference);
});

test.concurrent(`${chalk.yellowBright("update-quantity: stripe sync downgrade quantity difference")}`, async () => {
	const customerId = "qty-stripe-sync-downgrade";

	const product = products.base({
		id: "prepaid",
		items: [
			items.prepaid({
				featureId: TestFeature.Messages,
				billingUnits,
				config: {
					on_increase: OnIncrease.ProrateImmediately,
					on_decrease: OnDecrease.NoProrations,
				},
			}),
		],
	});

	const initialUnits = 8;
	const initialQuantity = initialUnits * billingUnits;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [
			s.billing.attach({
				productId: product.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	const subscriptionsBefore = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	const subscription = subscriptionsBefore.data[0];
	const subscriptionItemBefore = subscription.items.data.find(
		(item) => item.quantity !== undefined && item.quantity > 0,
	);
	expect(subscriptionItemBefore).toBeDefined();
	expect(subscriptionItemBefore!.quantity).toBe(initialUnits);

	const downgradedUnits = 3;
	const downgradedQuantity = downgradedUnits * billingUnits;
	const unitsDifference = downgradedUnits - initialUnits;

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: product.id,
		options: [
			{ feature_id: TestFeature.Messages, quantity: downgradedQuantity },
		],
	});

	const subscriptionsAfter = await stripeCli.subscriptions.list({
		customer: stripeCustomerId as string,
		status: "all",
	});

	const subscriptionAfter = subscriptionsAfter.data[0];
	const subscriptionItemAfter = subscriptionAfter.items.data.find(
		(item) => item.id === subscriptionItemBefore!.id,
	);

	expect(subscriptionItemAfter).toBeDefined();
	expect(subscriptionItemAfter!.quantity).toBe(downgradedUnits);
	expect(subscriptionItemAfter!.quantity).toBe(initialUnits + unitsDifference);
});
