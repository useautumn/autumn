import {
	CusProductStatus,
	customerProductHasActiveStatus,
	customerProductToReplacementKey,
	type FullCusProduct,
	isCustomerProductCanceling,
	isCustomerProductOneOff,
	isCustomerProductOnStripeSubscription,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { isUnbilledByStripe } from "../../utils/isUnbilledByStripe";
import type { ConfigInterner } from "../instanceConfig/createConfigInterner";
import { customerProductToInstanceConfig } from "../instanceConfig/instanceConfigs";
import type { TimelineRow } from "../types/timelineRow";

const isTimelineStatus = (customerProduct: FullCusProduct) =>
	customerProductHasActiveStatus(customerProduct) ||
	customerProduct.status === CusProductStatus.Scheduled;

const toSeconds = (epochMs: number | null | undefined) =>
	epochMs === null || epochMs === undefined
		? null
		: truncateMsToSecondPrecision(epochMs);

/** A live row runs now whatever its stored start; only a scheduled row starts later. */
const savedStartsAt = ({
	customerProduct,
	now,
}: {
	customerProduct: FullCusProduct;
	now: number;
}) => {
	const startsAt = toSeconds(customerProduct.starts_at) ?? now;
	return customerProduct.status === CusProductStatus.Scheduled
		? startsAt
		: Math.min(startsAt, now);
};

export const customerProductToTimelineRow = ({
	customerProduct,
	interner,
	liveStripeSubscriptionId,
	now,
}: {
	customerProduct: FullCusProduct;
	interner: ConfigInterner;
	liveStripeSubscriptionId?: string;
	now: number;
}): TimelineRow => ({
	customerProductId: customerProduct.id,
	planId: customerProduct.product.id,
	internalEntityId: customerProduct.internal_entity_id ?? null,
	replacementKey: customerProductToReplacementKey({ customerProduct }),
	configHash: interner.configHash(
		customerProductToInstanceConfig({ customerProduct, now }),
	),
	lifetime: isCustomerProductOneOff(customerProduct),
	onLiveSubscription:
		liveStripeSubscriptionId !== undefined &&
		isCustomerProductOnStripeSubscription({
			customerProduct,
			stripeSubscriptionId: liveStripeSubscriptionId,
		}) === true,
	startsAt: savedStartsAt({ customerProduct, now }),
	endsAt: toSeconds(customerProduct.ended_at),
	scheduled: customerProduct.status === CusProductStatus.Scheduled,
	canceling: isCustomerProductCanceling(customerProduct),
	pastDue: customerProduct.status === CusProductStatus.PastDue,
	unbilledByStripe: isUnbilledByStripe({ customerProduct, now }),
	externalId: customerProduct.external_id ?? null,
});

/** The in-scope live and scheduled rows the timeline reads; everything else is left alone. */
export const customerProductsToTimelineRows = ({
	customerProducts,
	interner,
	liveStripeSubscriptionId,
	now,
}: {
	customerProducts: FullCusProduct[];
	interner: ConfigInterner;
	liveStripeSubscriptionId?: string;
	now: number;
}): TimelineRow[] =>
	customerProducts.filter(isTimelineStatus).map((customerProduct) =>
		customerProductToTimelineRow({
			customerProduct,
			interner,
			liveStripeSubscriptionId,
			now,
		}),
	);
