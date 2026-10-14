import { expect, test } from "bun:test";
import { type ApiCustomer, type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("cancel end of cycle: with default free product")}`, async () => {
	const customerId = "cancel-eoc-with-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro], customerIdsToDelete: [customerId] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		canceling: [pro.id],
		scheduled: [free.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	await expectCustomerInvoiceCorrect({
		autumn: autumnV1,
		customerId,
		count: 1,
		latestTotal: 20,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
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
});

test.concurrent(`${chalk.yellowBright("cancel end of cycle: no default product")}`, async () => {
	const customerId = "cancel-eoc-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 1,
		latestTotal: 20,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});

	expect(customerAfterAdvance.products.length).toBe(0);

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.concurrent(`${chalk.yellowBright("cancel end of cycle: downgrade then cancel (with default)")}`, async () => {
	const customerId = "cancel-eoc-downgrade-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const stripeCustomerId = customer.stripe_id;
	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
	});
	expect(subs.data.length).toBe(1);

	const sub = subs.data[0];

	expect(sub.schedule).not.toBeNull();

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		canceling: [premium.id],
		notPresent: [pro.id],
		scheduled: [free.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		active: [free.id],
		notPresent: [premium.id],
	});
});

test.concurrent(`${chalk.yellowBright("cancel end of cycle: downgrade then cancel (no default)")}`, async () => {
	const customerId = "cancel-eoc-downgrade-no-default";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }),
		],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [premium.id],
		notPresent: [pro.id],
	});

	const scheduledProducts = customerAfterCancel.products.filter(
		(p) => p.status === "scheduled",
	);
	expect(scheduledProducts.length).toBe(0);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

test.concurrent(`${chalk.yellowBright("cancel end of cycle: multi-interval product (monthly + annual)")}`, async () => {
	const customerId = "cancel-eoc-multi-interval";

	const messagesItem = items.prepaidMessages({ includedUsage: 0 });
	const annualPriceItem = items.annualPrice({ price: 200 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, annualPriceItem],
	});

	const free = products.base({
		id: "free",
		items: [items.dashboard()],
		isDefault: true,
	});

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	const customerV2 = await autumnV2.customers.get<ApiCustomer>(customerId);

	const proSubscription = customerV2.subscriptions.find(
		(sub) => sub.plan_id === pro.id,
	);
	expect(proSubscription).toBeDefined();

	expect(proSubscription!.expires_at).not.toBeNull();
	expect(proSubscription!.canceled_at).not.toBeNull();

	const now = Date.now();
	const oneYearFromNow = now + ms.days(365);
	const tolerance = ms.hours(1);

	expect(proSubscription!.expires_at!).toBeWithin(
		oneYearFromNow - tolerance,
		oneYearFromNow + tolerance,
	);

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
		options: { shouldBeCanceling: true },
	});
});

test.concurrent(`${chalk.yellowBright("cancel end of cycle: then cancel immediately")}`, async () => {
	const customerId = "cancel-eoc-then-imm";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		canceling: [pro.id],
		scheduled: [free.id],
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		notPresent: [pro.id],
		active: [free.id],
	});

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
