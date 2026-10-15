import {
	BillingMethod,
	isAllocatedPrice,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	type LineItem,
	type RemoveLine,
	type RemoveLineFeatureQuantity,
	type RemoveLinePrice,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	licensePlanId,
	lineEntityId,
	linesMatchedByRemoveLine,
	ownerPlanId,
} from "./removeInvoiceLines";

type PriceSelector =
	| { price: RemoveLinePrice }
	| { feature_quantities: RemoveLineFeatureQuantity[] };

const lineToPriceSelector = (lineItem: LineItem): PriceSelector | null => {
	const { price } = lineItem.context;
	if (!price?.config) return null;
	const narrow = {
		interval: price.config.interval,
		interval_count: price.config.interval_count ?? 1,
	};
	if (isFixedPrice(price)) return { price: narrow };

	const billingBehavior = isPrepaidPrice(price)
		? BillingMethod.Prepaid
		: isConsumablePrice(price) || isAllocatedPrice(price)
			? BillingMethod.UsageBased
			: undefined;
	if (!billingBehavior) return null;
	const featureId = (price.config as UsagePriceConfig).feature_id;
	if (!featureId) return null;
	return {
		feature_quantities: [
			{ feature_id: featureId, billing_behavior: billingBehavior, ...narrow },
		],
	};
};

/** The most specific remove_lines entry for one line, or null when it can't target that line alone. */
export const lineItemToRemoveLine = ({
	lineItem,
	lineItems,
}: {
	lineItem: LineItem;
	lineItems: LineItem[];
}): RemoveLine | null => {
	const priceSelector = lineToPriceSelector(lineItem);
	if (!priceSelector) return null;

	const licenseId = licensePlanId(lineItem);
	const entry: RemoveLine = {
		plan_id: ownerPlanId(lineItem),
		entity_id: lineEntityId(lineItem),
		direction: lineItem.context.direction,
		...(licenseId
			? {
					license_quantities: [
						{ license_plan_id: licenseId, ...priceSelector },
					],
				}
			: priceSelector),
	};

	const matched = linesMatchedByRemoveLine({ lineItems, entry });
	return matched.length === 1 && matched[0] === lineItem ? entry : null;
};
