import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	AttachParamsV0Input,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test.concurrent(`${chalk.yellowBright("no_billing_changes: attach with no_billing_changes does not create stripe customer")}`, async () => {
	const customerId = "no-billing-changes-no-stripe";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ id: "free", items: [messagesItem] });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		setup: [
			s.deleteCustomer({ customerId }),
			s.products({ list: [free, pro], prefix: customerId }),
		],
		actions: [],
	});

	await autumnV1.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
		internalOptions: { disable_defaults: true },
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: free.id,
		no_billing_changes: true,
	});

	await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: pro.id,
		no_billing_changes: true,
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [free.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	const dbCustomer = await CusService.get({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	expect(dbCustomer?.processor?.id).toBeUndefined();

	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

/**
 * Regression: attaching with no_billing_changes:true on a customer whose
 * current paid product is linked to a Stripe subscription used to fail with
 * "paid but no stripe subscription is linked to it", because skipBillingFetching
 * short-circuited setupStripeBillingContext and the guard read the (undefined)
 * runtime-fetched stripeSubscription. Fix decouples no_billing_changes from
 * skipBillingFetching: writes are still suppressed, but the sub is read so its
 * id carries over to the new cusProduct.
 */
test.concurrent(`${chalk.yellowBright("no_billing_changes: carries subscription_ids forward when current paid product is linked")}`, async () => {
	const customerId = "no-billing-changes-paid-current";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-nbc-paid-current",
		items: [messagesItem],
	});
	const premium = products.premium({
		id: "premium-nbc-paid-current",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const beforeFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const beforeProCusProduct = beforeFullCustomer.customer_products.find(
		(cp) => cp.product.id === pro.id,
	);
	const expectedSubscriptionIds = beforeProCusProduct?.subscription_ids ?? [];
	expect(expectedSubscriptionIds.length).toBeGreaterThan(0);

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		no_billing_changes: true,
	});

	const afterCustomer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: afterCustomer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	const afterFullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const afterPremiumCusProduct = afterFullCustomer.customer_products.find(
		(cp) => cp.product.id === premium.id,
	);

	expect(afterPremiumCusProduct?.subscription_ids).toEqual(
		expectedSubscriptionIds,
	);
});
