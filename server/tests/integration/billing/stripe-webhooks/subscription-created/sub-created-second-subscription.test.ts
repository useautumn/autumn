/**
 * A second Stripe subscription must not take over a plan that belongs to a
 * different, still-active Stripe subscription.
 *
 * Red (current):  customer.subscription.created for sub B expires the plan on
 *                 sub A and re-creates it on sub B; when B ends the customer
 *                 drops to the default plan while sub A keeps billing.
 * Green (after):  the plan stays active and linked to sub A, sub B stays
 *                 unlinked, and canceling sub B changes nothing.
 */

import { expect, test } from "bun:test";
import {
	createStripeSubscriptionFromProduct,
	getFirstStripePriceId,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { ProductService } from "@/internal/products/ProductService";

const WEBHOOK_SETTLE_MS = 12000;

const expectPlanLinkedOnlyTo = async ({
	customerId,
	productId,
	stripeSubscriptionId,
	otherStripeSubscriptionId,
}: {
	customerId: string;
	productId: string;
	stripeSubscriptionId: string;
	otherStripeSubscriptionId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(product) => product.product_id === productId,
	);
	expect(customerProduct?.subscription_ids).toEqual([stripeSubscriptionId]);

	const linkedToOther = await CusProductService.getByStripeSubId({
		db: ctx.db,
		stripeSubId: otherStripeSubscriptionId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(linkedToOther).toEqual([]);
};

test(`${chalk.yellowBright("customer.subscription.created auto-sync: a second trial sub does not take over the plan on the active sub")}`, async () => {
	const customerId = "sub-created-second-sub";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const activeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const trialSubscription = await ctx.stripeCli.subscriptions.create({
		customer: fullCustomer.processor?.id as string,
		items: [{ price: getFirstStripePriceId({ fullProduct }) }],
		trial_period_days: 7,
		cancel_at_period_end: true,
	});
	await timeout(WEBHOOK_SETTLE_MS);

	await expectPlanLinkedOnlyTo({
		customerId,
		productId: pro.id,
		stripeSubscriptionId: activeSubscription.id,
		otherStripeSubscriptionId: trialSubscription.id,
	});

	await ctx.stripeCli.subscriptions.cancel(trialSubscription.id);
	await timeout(WEBHOOK_SETTLE_MS);

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});
	await expectPlanLinkedOnlyTo({
		customerId,
		productId: pro.id,
		stripeSubscriptionId: activeSubscription.id,
		otherStripeSubscriptionId: trialSubscription.id,
	});
});
