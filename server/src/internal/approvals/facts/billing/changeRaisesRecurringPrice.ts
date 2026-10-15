import {
	type FullCusProduct,
	isCustomerProductCanceling,
	type StripeDiscountWithCoupon,
} from "@autumn/shared";
import { applyDiscountsToRecurringTotal } from "./applyDiscountsToRecurringTotal";
import { customerProductsToRecurringTotals } from "./customerProductsToRecurringTotals";

const discountedRecurringTotals = ({
	customerProducts,
	discounts,
	currency,
}: {
	customerProducts: FullCusProduct[];
	discounts: StripeDiscountWithCoupon[];
	currency: string;
}) =>
	new Map(
		[...customerProductsToRecurringTotals({ customerProducts, currency })].map(
			([interval, total]) => [
				interval,
				applyDiscountsToRecurringTotal({ total, discounts, currency }),
			],
		),
	);

// Incoming rows live in phases: each bills from its start until it ends or is replaced.
const isActiveAt = ({
	customerProduct,
	atMs,
}: {
	customerProduct: FullCusProduct;
	atMs: number;
}) =>
	customerProduct.starts_at <= atMs &&
	(customerProduct.ended_at == null || customerProduct.ended_at > atMs) &&
	!isCustomerProductCanceling(customerProduct);

/**
 * Whether any billing interval costs more after the change, phase by phase and
 * after coupons. Catches raises the next invoice doesn't show, like annual units on a monthly plan.
 */
export const changeRaisesRecurringPrice = ({
	incoming,
	outgoing,
	currentDiscounts,
	incomingDiscounts,
	currency,
}: {
	incoming: FullCusProduct[];
	outgoing: FullCusProduct[];
	currentDiscounts: StripeDiscountWithCoupon[];
	incomingDiscounts: StripeDiscountWithCoupon[];
	currency: string;
}): boolean => {
	const before = discountedRecurringTotals({
		customerProducts: outgoing,
		discounts: currentDiscounts,
		currency,
	});
	const phaseStarts = [
		...new Set(incoming.map(({ starts_at: startsAt }) => startsAt)),
	];

	return phaseStarts.some((atMs) => {
		const after = discountedRecurringTotals({
			customerProducts: incoming.filter((customerProduct) =>
				isActiveAt({ customerProduct, atMs }),
			),
			discounts: incomingDiscounts,
			currency,
		});
		return [...after].some(
			([interval, total]) => total > (before.get(interval) ?? 0),
		);
	});
};
