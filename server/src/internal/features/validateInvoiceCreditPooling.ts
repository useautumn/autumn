import {
	ErrCode,
	type Feature,
	type ProductItem,
	RecaseError,
} from "@autumn/shared";
import { isInvoiceCreditFeature } from "./creditSystemUtils.js";

export const validateInvoiceCreditPooling = ({
	feature,
	pooled,
}: {
	feature?: Feature;
	pooled?: boolean;
}): void => {
	if (!pooled || !isInvoiceCreditFeature({ feature })) return;

	throw new RecaseError({
		message: "Invoice-credit features cannot use pooled plan items",
		code: ErrCode.InvalidProductItem,
		statusCode: 400,
	});
};

export const validateInvoiceCreditUsageBasedPricing = ({
	feature,
	usageBased,
}: {
	feature?: Feature;
	usageBased: boolean;
}): void => {
	if (usageBased || !isInvoiceCreditFeature({ feature })) return;

	throw new RecaseError({
		message: "Invoice-credit features require usage-based pricing",
		code: ErrCode.InvalidProductItem,
		statusCode: 400,
	});
};

export const validateInvoiceCreditPrice = ({
	feature,
	item,
}: {
	feature?: Feature;
	item: ProductItem;
}): void => {
	if (!isInvoiceCreditFeature({ feature })) return;

	const billingUnits = item.billing_units ?? 1;
	const hasOneToOnePrice =
		billingUnits > 0 &&
		(item.price !== null && item.price !== undefined
			? item.price === billingUnits &&
				(item.additional_currencies ?? []).every(
					(currency) => currency.amount === billingUnits,
				)
			: (item.tiers?.length ?? 0) > 0 &&
				item.tiers?.every(
					(tier) =>
						tier.amount === billingUnits &&
						(tier.flat_amount === null ||
							tier.flat_amount === undefined ||
							tier.flat_amount === 0) &&
						(tier.additional_currencies ?? []).every(
							(currency) => currency.amount === billingUnits,
						),
				));

	if (hasOneToOnePrice) return;

	throw new RecaseError({
		message:
			"Invoice-credit features require a price of one currency unit per credit",
		code: ErrCode.InvalidProductItem,
		statusCode: 400,
	});
};
