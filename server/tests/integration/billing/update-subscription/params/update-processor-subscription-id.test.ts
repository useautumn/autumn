import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	CustomerExpand,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { createCustomStripeSubscription } from "@tests/integration/billing/utils/stripe/createCustomStripeSubscription";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ─── Test 1: Update processor_subscription_id to null clears subscription_ids ───

test(`${chalk.yellowBright("update processor_subscription_id: setting null clears subscription_ids")}`, async () => {
	const customerId = "update-proc-sub-id-null";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		processor_subscription_id: null,
	});

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProductAfter = fullCustomerAfter.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(cusProductAfter).toBeDefined();
	expect(cusProductAfter?.subscription_ids).toEqual([]);
});

// ─── Test 2: Update processor_subscription_id to a new stripe subscription ───

test(`${chalk.yellowBright("update processor_subscription_id: set to new stripe subscription links correctly")}`, async () => {
	const customerId = "update-proc-sub-id-set";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const newStripeSubscription = await createCustomStripeSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		processor_subscription_id: newStripeSubscription.id,
	});

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProductAfter = fullCustomerAfter.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(cusProductAfter).toBeDefined();
	expect(cusProductAfter?.subscription_ids).toContain(newStripeSubscription.id);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerAfter, active: [pro.id] });
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 100,
	});

	const stripeSubscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
		newStripeSubscription.id,
	);
	expectStripeSubscriptionUnchanged({
		before: newStripeSubscription,
		after: stripeSubscriptionAfter,
	});
});

// ─── Test 3: Update processor_subscription_id + customize simultaneously ───
// Stripe subscription should remain unchanged, only Autumn plan is updated.

test(`${chalk.yellowBright("update processor_subscription_id: with customize leaves stripe subscription unchanged")}`, async () => {
	const customerId = "update-proc-sub-id-customize";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, autumnV2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const newStripeSubscription = await createCustomStripeSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	await autumnV2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		processor_subscription_id: newStripeSubscription.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 50 }),
			items: [itemsV2.monthlyMessages({ included: 250 })],
		},
	});

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProductAfter = fullCustomerAfter.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(cusProductAfter).toBeDefined();
	expect(cusProductAfter?.subscription_ids).toContain(newStripeSubscription.id);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({ customer: customerAfter, active: [pro.id] });

	const customerV2After = await autumnV2.customers.get<ApiCustomerV5>(
		customerId,
		{
			expand: ["subscriptions.plan" as CustomerExpand],
		},
	);
	expect(customerV2After.subscriptions[0].plan?.price?.amount).toBe(50);

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 250,
	});

	const stripeSubscriptionAfter = await ctx.stripeCli.subscriptions.retrieve(
		newStripeSubscription.id,
	);
	expectStripeSubscriptionUnchanged({
		before: newStripeSubscription,
		after: stripeSubscriptionAfter,
	});
});
