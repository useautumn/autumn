import {
	type FullCustomerPrice,
	InternalError,
	type Price,
	type Product,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripePriceIdMatchesAutumnPrice } from "../matchUtils/stripePriceIdMatchesAutumnPrice.js";
import { stripeProductIdMatchesAutumnPrice } from "../matchUtils/stripeProductIdMatchesAutumnPrice.js";
import { normalizeStripeCheckoutLineItem } from "../normalizeStripeObject.js";

type FindCheckoutLineItemParams = {
	lineItems: Stripe.LineItem[];
	price: Price;
	product: Product;
	customerPrice?: FullCustomerPrice;
};

export function findCheckoutLineItemForAutumnPrice(
	params: FindCheckoutLineItemParams & { errorOnNotFound: true },
): Stripe.LineItem;

export function findCheckoutLineItemForAutumnPrice(
	params: FindCheckoutLineItemParams & { errorOnNotFound?: false },
): Stripe.LineItem | undefined;

export function findCheckoutLineItemForAutumnPrice({
	lineItems,
	price,
	product,
	errorOnNotFound,
	customerPrice,
}: FindCheckoutLineItemParams & { errorOnNotFound?: boolean }) {
	const metadataMatchedLineItem = lineItems.find((lineItem) => {
		if (customerPrice) {
			return customerPrice.id === lineItem.metadata?.autumn_customer_price_id;
		}

		return price.id === lineItem.metadata?.autumn_price_id;
	});

	if (metadataMatchedLineItem) return metadataMatchedLineItem;

	const lineItem = lineItems.find((checkoutLineItem) => {
		const candidate = normalizeStripeCheckoutLineItem({
			checkoutLineItem,
		});

		return (
			stripePriceIdMatchesAutumnPrice({
				candidate,
				price,
			}) ||
			stripeProductIdMatchesAutumnPrice({
				candidate,
				price,
				product,
			})
		);
	});

	if (errorOnNotFound && !lineItem) {
		throw new InternalError({
			message: `Checkout line item not found for price: ${price.id}`,
		});
	}

	return lineItem;
}
