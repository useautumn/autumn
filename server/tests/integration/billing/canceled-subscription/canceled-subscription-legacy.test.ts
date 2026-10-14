import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getSubscriptionIdsForProduct,
	linkCustomerProductToCanceledSubscription,
	listStripeSubscriptions,
} from "./utils/canceledSubscriptionUtils";

test(`${chalk.yellowBright("canceled sub legacy: v1 attach of another plan creates a fresh sub")}`, async () => {
	const customerId = "canceled-sub-legacy-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { subscriptionId, stripeCustomerId } =
		await linkCustomerProductToCanceledSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

	await autumnV1.attach({ customer_id: customerId, product_id: premium.id });

	const liveSubscriptions = (
		await listStripeSubscriptions({ ctx, stripeCustomerId })
	).filter((sub) => sub.status !== "canceled");
	expect(liveSubscriptions.length).toBe(1);
	expect(liveSubscriptions[0].id).not.toBe(subscriptionId);

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [premium.id],
		notPresent: [pro.id],
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: 50,
	});
});

test(`${chalk.yellowBright("canceled sub legacy: v1 quantity update applies without charging")}`, async () => {
	const customerId = "canceled-sub-legacy-qty";
	const billingUnits = 100;

	const prepaidItem = items.prepaidMessages({ billingUnits, price: 10 });
	const pro = products.pro({ id: "pro", items: [prepaidItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: billingUnits }],
			}),
		],
	});

	const { subscriptionId, stripeCustomerId } =
		await linkCustomerProductToCanceledSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;
	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: billingUnits * 2 }],
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.map((sub) => sub.id).sort()).toEqual(
		subscriptionsBefore.map((sub) => sub.id).sort(),
	);
	expect(
		subscriptionsAfter.every((sub) => sub.status === "canceled"),
		"every stripe subscription should still be canceled",
	).toBe(true);

	await expectBalanceCorrect({
		customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
		featureId: TestFeature.Messages,
		remaining: billingUnits * 2,
	});
	expect(
		await getSubscriptionIdsForProduct({ ctx, customerId, productId: pro.id }),
	).toEqual([subscriptionId]);
});
