import type { FullCusProduct } from "@autumn/shared";
import { pairCustomerProducts } from "@/internal/billing/v2/compute/pairCustomerProducts";
import type { TimelineDiff } from "../timeline/types/timelineDiff";

/** Rows a plan starting now replaces, by instance or by group: the only rows usage can carry from. */
export const nowReplacedCustomerProducts = ({
	diff,
	outgoingCustomerProducts,
	incomingCustomerProducts,
}: {
	diff: TimelineDiff;
	outgoingCustomerProducts: FullCusProduct[];
	incomingCustomerProducts: FullCusProduct[];
}): FullCusProduct[] => {
	const keysInsertedNow = new Set(
		diff.operations.flatMap((operation) =>
			operation.type === "insert" && operation.startsNow ? [operation.key] : [],
		),
	);
	const replacedIds = new Set([
		...diff.operations.flatMap((operation) =>
			operation.type === "expire" && keysInsertedNow.has(operation.key)
				? [operation.customerProductId]
				: [],
		),
		...pairCustomerProducts({
			outgoingCustomerProducts,
			incomingCustomerProducts,
		}).map(({ outgoingCustomerProduct }) => outgoingCustomerProduct.id),
	]);
	return outgoingCustomerProducts.filter((customerProduct) =>
		replacedIds.has(customerProduct.id),
	);
};
