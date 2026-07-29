import type {
	CustomerLicenseTransition,
	LicenseBillingPriceRow,
	Price,
} from "@autumn/shared";
import { isFixedPrice, isOneOffPrice } from "@autumn/shared";
import { applyBasePriceOperationToLicenseBillingRows } from "@/internal/billing/v2/actions/batchTransition/compute/operations/basePriceOperations/applyBasePriceOperationToLicenseBillingRows";
import { computeBasePriceOperation } from "@/internal/billing/v2/actions/batchTransition/compute/operations/basePriceOperations/computeBasePriceOperation";
import { computeProductTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeProductTransitions";

const priceIsRecurringBasePrice = ({ price }: { price: Price }): boolean =>
	price.entitlement_id == null && isFixedPrice(price) && !isOneOffPrice(price);

const distinctBasePrices = ({
	licenseBillingPriceRows,
}: {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
}): Price[] => {
	const basePricesById = new Map<string, Price>();
	for (const row of licenseBillingPriceRows) {
		if (priceIsRecurringBasePrice({ price: row.price })) {
			basePricesById.set(row.price.id, row.price);
		}
	}
	return [...basePricesById.values()];
};

const billableAssignedQuantity = ({
	transition,
	assignedSeatCount,
}: {
	transition: CustomerLicenseTransition;
	assignedSeatCount: number;
}): number => {
	const included =
		transition.incomingCustomerLicense.planLicense?.included ?? 0;
	return Math.min(
		transition.updates.paidQuantity,
		Math.max(0, assignedSeatCount - included),
	);
};

/** Projects persisted outgoing seat rows through the transition's definition-aware operations. */
export const transitionLicenseBillingPriceRows = ({
	licenseBillingPriceRows,
	customerLicenseTransition,
	assignedSeatCount,
}: {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	customerLicenseTransition: CustomerLicenseTransition;
	assignedSeatCount: number;
}): LicenseBillingPriceRow[] => {
	const { outgoingCustomerLicense, incomingCustomerLicense } =
		customerLicenseTransition;
	const fromProduct = outgoingCustomerLicense.planLicense?.product;
	const toProduct = incomingCustomerLicense.planLicense?.product;
	if (!fromProduct || !toProduct) return [];

	const outgoingSeatRows = licenseBillingPriceRows.filter(
		(row) => row.source.customerLicenseId === outgoingCustomerLicense.id,
	);
	const productTransitions = computeProductTransitions({
		fromProduct,
		toProduct,
	});
	const basePriceOperation = computeBasePriceOperation({
		basePriceTransition: productTransitions.basePrice,
		candidateOutgoingBasePrices: distinctBasePrices({
			licenseBillingPriceRows: outgoingSeatRows,
		}),
	});
	const rowsAfterBasePriceOperation =
		applyBasePriceOperationToLicenseBillingRows({
			licenseBillingPriceRows: outgoingSeatRows,
			operation: basePriceOperation,
			targetQuantity: billableAssignedQuantity({
				transition: customerLicenseTransition,
				assignedSeatCount,
			}),
			addRowContext: {
				customerProductId: outgoingCustomerLicense.parent_customer_product_id,
				source: {
					type: "customer_license_seat",
					customerLicenseId: outgoingCustomerLicense.id,
				},
			},
		});

	return rowsAfterBasePriceOperation.map((row) => {
		return {
			customerProductId: incomingCustomerLicense.parent_customer_product_id,
			price: row.price,
			quantity: row.quantity,
			source: {
				type: row.source.type,
				customerLicenseId: incomingCustomerLicense.id,
				planLicenseId: incomingCustomerLicense.planLicense?.id,
			},
		};
	});
};
