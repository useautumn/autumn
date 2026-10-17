import {
	type FullCusProduct,
	isCustomerProductCanceling,
} from "@autumn/shared";
import { customerProductsToRecurringTotals } from "./customerProductsToRecurringTotals";

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
 * Whether any billing interval's list price rises, phase by phase. Coupons are
 * left out on purpose: when unsure, a change reads as paid, never as free.
 */
export const changeRaisesRecurringPrice = ({
	incoming,
	outgoing,
	currency,
}: {
	incoming: FullCusProduct[];
	outgoing: FullCusProduct[];
	currency: string;
}): boolean => {
	const before = customerProductsToRecurringTotals({
		customerProducts: outgoing,
		currency,
	});
	const phaseStarts = [
		...new Set(incoming.map(({ starts_at: startsAt }) => startsAt)),
	];

	return phaseStarts.some((atMs) => {
		const after = customerProductsToRecurringTotals({
			customerProducts: incoming.filter((customerProduct) =>
				isActiveAt({ customerProduct, atMs }),
			),
			currency,
		});
		return [...after].some(
			([interval, total]) => total > (before.get(interval) ?? 0),
		);
	});
};
