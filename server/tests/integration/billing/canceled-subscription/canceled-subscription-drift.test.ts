import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	getSubscriptionIdsForProduct,
	linkCustomerProductToCanceledSubscription,
	listStripeSubscriptions,
} from "./utils/canceledSubscriptionUtils";

test(`${chalk.yellowBright("canceled sub: update feature_quantities succeeds without a new sub or charge")}`, async () => {
	const customerId = "canceled-sub-update-qty";
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

	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: billingUnits * 2 },
		],
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

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});

	expect(
		await getSubscriptionIdsForProduct({ ctx, customerId, productId: pro.id }),
	).toEqual([subscriptionId]);

	await expectBalanceCorrect({
		customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
		featureId: TestFeature.Messages,
		remaining: billingUnits * 2,
	});
});

test(`${chalk.yellowBright("canceled sub: cancel_immediately expires the plan and activates the default")}`, async () => {
	const customerId = "canceled-sub-cancel-now";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCustomerId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		notPresent: [pro.id],
		active: [free.id],
	});

	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.length).toBe(subscriptionsBefore.length);

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 1,
	});
});

test(`${chalk.yellowBright("canceled sub: cancel_end_of_cycle is rejected with a remedy")}`, async () => {
	const customerId = "canceled-sub-cancel-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { subscriptionId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	await expectAutumnError({
		errMessage: subscriptionId,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	await expectAutumnError({
		errMessage: "cancel_immediately",
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
			}),
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [pro.id],
	});
});

test(`${chalk.yellowBright("canceled sub: uncancel is rejected rather than reviving an unbilled plan")}`, async () => {
	const customerId = "canceled-sub-uncancel";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id }), s.cancel({ productId: pro.id })],
	});

	const { subscriptionId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	await expectAutumnError({
		errMessage: subscriptionId,
		func: () =>
			autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
				customer_id: customerId,
				plan_id: pro.id,
				cancel_action: "uncancel",
			}),
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		canceling: [pro.id],
	});
});

test(`${chalk.yellowBright("canceled sub: attaching another plan creates a fresh sub and charges full price")}`, async () => {
	const customerId = "canceled-sub-attach-fresh";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });
	const premium = products.premium({ id: "premium", items: [messagesItem] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
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

	await autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: premium.id,
	});

	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	const liveSubscriptions = subscriptionsAfter.filter(
		(sub) => sub.status !== "canceled",
	);
	expect(liveSubscriptions.length).toBe(1);
	expect(liveSubscriptions[0].id).not.toBe(subscriptionId);

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 2,
		latestTotal: 50,
	});

	await expectCustomerProducts({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		active: [premium.id],
		notPresent: [pro.id],
	});
});
