/**
 * A metadata match names one entity's customer price, but Stripe merges every
 * entity on that price into one line. Siblings on the same Autumn price must be
 * kept so the merged line is attributed to all of them.
 */

import { describe, expect, test } from "bun:test";
import {
	type FullCustomerPrice,
	filterBillingLineItemsByStripeLineItem,
	type LineItem,
} from "@autumn/shared";
import { lineItems } from "@tests/utils/fixtures/billing/lineItems";
import { entities } from "@tests/utils/fixtures/db/entities";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import type Stripe from "stripe";

const basePrice = prices.createFixed({
	id: "pr_base",
	stripePriceId: "price_base",
});
const otherPrice = prices.createFixed({
	id: "pr_other",
	stripePriceId: "price_other",
});

const entityLine = ({
	entityId,
	customerPriceId,
	price = basePrice,
}: {
	entityId: string;
	customerPriceId: string;
	price?: typeof basePrice;
}): LineItem => {
	const li = lineItems.charge({ amount: 20 });
	li.context.price = price;
	li.context.entity = entities.create({ id: entityId, featureId: "users" });
	li.context.customerPrice = { id: customerPriceId } as FullCustomerPrice;
	return li;
};

const stripeLine = ({ priceId }: { priceId: string }) =>
	({
		id: "il_1",
		metadata: {},
		pricing: { price_details: { price: priceId, product: "prod_x" } },
	}) as unknown as Stripe.InvoiceLineItem;

describe(chalk.yellowBright("filterBillingLineItemsByStripeLineItem"), () => {
	test("metadata match keeps siblings on the same Autumn price", () => {
		const alice = entityLine({
			entityId: "alice",
			customerPriceId: "cp_alice",
		});
		const bob = entityLine({ entityId: "bob", customerPriceId: "cp_bob" });
		const other = entityLine({
			entityId: "alice",
			customerPriceId: "cp_x",
			price: otherPrice,
		});

		const matched = filterBillingLineItemsByStripeLineItem({
			stripeLineItem: stripeLine({ priceId: "price_base" }),
			autumnLineItems: [alice, bob, other],
			subscriptionItemMetadata: { autumn_customer_price_id: "cp_alice" },
		});

		expect(matched.map((li) => li.context.entity?.id)).toEqual([
			"alice",
			"bob",
		]);
	});

	test("per-entity inline prices (product-level match only) are not absorbed", () => {
		const alice = entityLine({
			entityId: "alice",
			customerPriceId: "cp_alice",
		});
		const bob = entityLine({ entityId: "bob", customerPriceId: "cp_bob" });
		alice.context.product = {
			processor: { id: "prod_x" },
		} as LineItem["context"]["product"];
		bob.context.product = {
			processor: { id: "prod_x" },
		} as LineItem["context"]["product"];

		const matched = filterBillingLineItemsByStripeLineItem({
			stripeLineItem: stripeLine({ priceId: "price_inline_alice" }),
			autumnLineItems: [alice, bob],
			subscriptionItemMetadata: { autumn_customer_price_id: "cp_alice" },
		});

		expect(matched).toEqual([alice]);
	});

	test("exact line-item-id match stays exclusive", () => {
		const alice = entityLine({
			entityId: "alice",
			customerPriceId: "cp_alice",
		});
		const bob = entityLine({ entityId: "bob", customerPriceId: "cp_bob" });

		const matched = filterBillingLineItemsByStripeLineItem({
			stripeLineItem: stripeLine({ priceId: "price_base" }),
			autumnLineItems: [alice, bob],
			subscriptionItemMetadata: { autumn_line_item_id: alice.id },
		});

		expect(matched).toEqual([alice]);
	});

	test("no metadata: all price matches returned as before", () => {
		const alice = entityLine({
			entityId: "alice",
			customerPriceId: "cp_alice",
		});
		const bob = entityLine({ entityId: "bob", customerPriceId: "cp_bob" });

		const matched = filterBillingLineItemsByStripeLineItem({
			stripeLineItem: stripeLine({ priceId: "price_base" }),
			autumnLineItems: [alice, bob],
		});

		expect(matched).toEqual([alice, bob]);
	});
});
