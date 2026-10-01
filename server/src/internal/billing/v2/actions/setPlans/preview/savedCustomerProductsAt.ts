import {
	CusProductStatus,
	customerProductHasActiveStatus,
	type FullCusProduct,
	type FullCustomer,
} from "@autumn/shared";
import { phaseStartsMatch } from "@/internal/billing/v2/utils/phaseStartsMatch";

const startsBy = ({
	customerProduct,
	at,
}: {
	customerProduct: FullCusProduct;
	at: number;
}) => {
	if (customerProductHasActiveStatus(customerProduct)) return true;
	if (customerProduct.status !== CusProductStatus.Scheduled) return false;
	return (
		customerProduct.starts_at < at ||
		phaseStartsMatch({ startsAt: customerProduct.starts_at, otherStartsAt: at })
	);
};

const endsBy = ({
	customerProduct,
	at,
}: {
	customerProduct: FullCusProduct;
	at: number;
}) => {
	const endedAt = customerProduct.ended_at;
	if (endedAt == null) return false;
	return (
		endedAt < at || phaseStartsMatch({ startsAt: endedAt, otherStartsAt: at })
	);
};

/** The customer products the customer's saved state (current plans plus saved schedule) holds at a moment. */
export const savedCustomerProductsAt = ({
	fullCustomer,
	at,
}: {
	fullCustomer: FullCustomer;
	at: number;
}) =>
	fullCustomer.customer_products.filter(
		(customerProduct) =>
			startsBy({ customerProduct, at }) && !endsBy({ customerProduct, at }),
	);

/** The saved state changes plans at this moment: a saved scheduled plan starts or a saved plan ends here. */
export const isSavedPhaseStart = ({
	fullCustomer,
	at,
}: {
	fullCustomer: FullCustomer;
	at: number;
}) =>
	fullCustomer.customer_products.some(
		(customerProduct) =>
			(customerProduct.status === CusProductStatus.Scheduled &&
				phaseStartsMatch({
					startsAt: customerProduct.starts_at,
					otherStartsAt: at,
				})) ||
			(customerProduct.ended_at != null &&
				phaseStartsMatch({
					startsAt: customerProduct.ended_at,
					otherStartsAt: at,
				})),
	);
