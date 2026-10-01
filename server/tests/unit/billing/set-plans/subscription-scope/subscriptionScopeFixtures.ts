import {
	BillingInterval,
	type CreateScheduleBillingContext,
	type FullCusProduct,
	type FullProduct,
	type Price,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";

export const SUBSCRIPTION_A = "sub_a";
export const SUBSCRIPTION_B = "sub_b";
export const SCHEDULE_A = "sub_sched_a";

const fixedPrice = ({
	id,
	interval,
}: {
	id: string;
	interval: BillingInterval;
}): Price => {
	const price = prices.createFixed({ id });
	return { ...price, config: { ...price.config, interval } } as Price;
};

export const planProduct = ({
	id,
	group = "main",
	isAddOn = false,
	paid = true,
	interval = BillingInterval.Month,
}: {
	id: string;
	group?: string;
	isAddOn?: boolean;
	paid?: boolean;
	interval?: BillingInterval;
}): FullProduct => ({
	...products.createFull({
		id,
		name: id,
		isAddOn,
		prices: paid ? [fixedPrice({ id: `price_${id}`, interval })] : [],
	}),
	group,
});

export const planCustomerProduct = ({
	id,
	product,
	subscriptionIds = [],
	scheduledIds = [],
}: {
	id: string;
	product: FullProduct;
	subscriptionIds?: string[];
	scheduledIds?: string[];
}): FullCusProduct => ({
	...customerProducts.create({
		id,
		productId: product.id,
		product,
		subscriptionIds,
		customerPrices: product.prices.map((price) =>
			prices.createCustomer({ price, customerProductId: id }),
		),
	}),
	scheduled_ids: scheduledIds,
});

export const scopeOver = ({
	customerProducts: scopedCustomerProducts,
	otherStripeSubscriptionIds = [SUBSCRIPTION_B],
}: {
	customerProducts: FullCusProduct[];
	otherStripeSubscriptionIds?: string[];
}): StripeSubscriptionScope => ({
	stripeSubscriptionId: SUBSCRIPTION_A,
	customerProductIds: scopedCustomerProducts.map(({ id }) => id),
	otherStripeSubscriptionIds,
});

export const scheduleBillingContext = ({
	existingCustomerProducts,
	requestedProducts,
	stripeSubscriptionScope,
	currency,
	stripeSubscriptionCurrency,
}: {
	existingCustomerProducts: FullCusProduct[];
	requestedProducts: FullProduct[];
	stripeSubscriptionScope?: StripeSubscriptionScope;
	currency?: string;
	stripeSubscriptionCurrency?: string;
}): CreateScheduleBillingContext => {
	const fullCustomer = { customer_products: existingCustomerProducts };
	return {
		fullCustomer,
		fullProducts: requestedProducts,
		productContexts: requestedProducts.map((fullProduct) => ({
			fullProduct,
			fullCustomer,
		})),
		scheduledPhaseContexts: [],
		replacedScheduleCustomerProductIds: [],
		stripeSubscriptionScope,
		currency,
		stripeSubscription: stripeSubscriptionCurrency
			? { id: SUBSCRIPTION_A, currency: stripeSubscriptionCurrency }
			: undefined,
	} as unknown as CreateScheduleBillingContext;
};
