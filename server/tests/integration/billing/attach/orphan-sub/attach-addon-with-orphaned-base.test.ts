import { expect, test } from "bun:test";
import chalk from "chalk";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusService } from "@/internal/customers/CusService";

test(`${chalk.yellowBright("attach addon with orphaned base: one-off add-on does not create a new recurring sub")}`, async () => {
	const customerId = "attach-addon-orphaned-base";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const oneOffCreditsItem = items.oneOffMessages({
		billingUnits: 50,
		price: 10,
	});
	const credits = products.oneOffAddOn({
		id: "credits-pack",
		items: [oneOffCreditsItem],
	});

	const { customerId: cid, autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, credits] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const fullCustomerBefore = await CusService.getFull({
		ctx,
		idOrInternalId: cid,
	});
	const proCusProduct = fullCustomerBefore.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(proCusProduct).toBeDefined();
	expect(proCusProduct!.subscription_ids?.length ?? 0).toBeGreaterThan(0);

	const stripeCustomerId = fullCustomerBefore.processor?.id;
	if (!stripeCustomerId) throw new Error("missing stripe customer id");

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subsBefore.data.length).toBe(1);
	const originalProSubId = subsBefore.data[0].id;

	await CusProductService.update({
		ctx,
		cusProductId: proCusProduct!.id,
		updates: { subscription_ids: [] },
	});

	await autumnV1.billing.attach({
		customer_id: cid,
		product_id: credits.id,
		feature_quantities: [
			{
				feature_id: oneOffCreditsItem.feature_id,
				quantity: oneOffCreditsItem.billing_units,
			},
		],
	});

	const subsAfter = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});

	expect(subsAfter.data.length).toBe(1);
	expect(subsAfter.data[0].id).toBe(originalProSubId);
});
