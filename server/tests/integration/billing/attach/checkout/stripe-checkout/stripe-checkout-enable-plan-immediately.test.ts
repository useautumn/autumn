import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV0Input,
	CusProductStatus,
	customers,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { waitForStripeWebhook } from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const parseCheckoutSessionId = (url: string): string | null => {
	const match = url.match(/\/c\/pay\/(cs_[^/?#]+)/);
	return match?.[1] ?? null;
};

test.concurrent(`${chalk.yellowBright("stripe-checkout enable_plan_immediately: pre-inserts cusProduct, webhook links sub")}`, async () => {
	const customerId = "stripe-checkout-eppi-happy";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-eppi-happy",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	expect(dbCustomer).toBeDefined();
	const internalCustomerId = dbCustomer!.internal_id;

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		enable_product_immediately: true,
	};
	const result = await autumnV1.billing.attach(attachParams);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const checkoutSessionId = parseCheckoutSessionId(result.payment_url!);
	expect(checkoutSessionId).toBeTruthy();

	const cusProductsBeforeCheckout = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});

	const proCusProductBefore = cusProductsBeforeCheckout.find(
		(cp) => cp.product.id === pro.id,
	);
	expect(proCusProductBefore).toBeDefined();
	expect(proCusProductBefore!.status).toBe(CusProductStatus.Active);
	expect(proCusProductBefore!.subscription_ids ?? []).toHaveLength(0);

	expect(proCusProductBefore!.stripe_checkout_session_id).toBe(
		checkoutSessionId,
	);

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	await completeStripeCheckoutForm({ url: result.payment_url! });

	const cusProductsAfter = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	const proCusProductAfter = cusProductsAfter.find(
		(cp) => cp.product.id === pro.id,
	);
	expect(proCusProductAfter).toBeDefined();
	expect(proCusProductAfter!.id).toBe(proCusProductBefore!.id);
	expect(proCusProductAfter!.subscription_ids ?? []).toHaveLength(1);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerAfter, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 40,
	});
});

test.concurrent(`${chalk.yellowBright("stripe-checkout enable_plan_immediately: expired session cleans up cusProduct")}`, async () => {
	const customerId = "stripe-checkout-eppi-expired";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-eppi-expired",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	const internalCustomerId = dbCustomer!.internal_id;

	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		enable_product_immediately: true,
	};
	const result = await autumnV1.billing.attach(attachParams);
	expect(result.payment_url).toBeDefined();

	const checkoutSessionId = parseCheckoutSessionId(result.payment_url!);
	expect(checkoutSessionId).toBeTruthy();

	const before = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	expect(before.some((cp) => cp.product.id === pro.id)).toBe(true);

	await ctx.stripeCli.checkout.sessions.expire(checkoutSessionId!);

	const isProActiveInApi = async () => {
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		return (customer.products ?? []).some((product) => product.id === pro.id);
	};

	await waitForStripeWebhook({
		stripeCli: ctx.stripeCli,
		env: ctx.env,
		types: ["checkout.session.expired"],
		objectId: checkoutSessionId!,
		until: async () => !(await isProActiveInApi()),
	});

	const after = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	expect(after.some((cp) => cp.product.id === pro.id)).toBe(false);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expect(
		expectProductActive({ customer: customerAfter, productId: pro.id }),
	).rejects.toThrow();
});
