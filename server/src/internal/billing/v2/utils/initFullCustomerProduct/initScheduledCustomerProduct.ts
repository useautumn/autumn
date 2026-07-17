import {
	BillingVersion,
	CusProductStatus,
	type CustomerLicenseQuantity,
	type Entity,
	type FeatureOptions,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { initFullCustomerProduct } from "./initFullCustomerProduct";

/**
 * Build a Scheduled cusProduct for a future-dated phase.
 *
 * Shared between createSchedule's `computeScheduledCustomerProducts` and
 * sync's `computeSyncFuturePhases` — the per-product init logic is identical
 * regardless of the action that produced the phase context.
 */
export const initScheduledCustomerProduct = ({
	ctx,
	fullCustomer,
	fullProduct,
	featureQuantities,
	customerLicenseQuantities,
	entity,
	startsAt,
	endsAt,
	currentEpochMs,
	accessStartsAt,
	externalId,
	isCustom,
	billingCycleAnchorResetsAt,
	subscriptionId,
	subscriptionScheduleId,
	internalEntityId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	fullProduct: FullProduct;
	featureQuantities: FeatureOptions[];
	customerLicenseQuantities?: CustomerLicenseQuantity[];
	entity?: Entity;
	startsAt: number;
	endsAt: number | null | undefined;
	currentEpochMs: number;
	accessStartsAt?: number;
	/** Customer-facing Autumn subscription API id, stored on customer_products.external_id. */
	externalId?: string;
	isCustom?: boolean;
	billingCycleAnchorResetsAt?: number | null;
	/** When syncing from an existing Stripe sub/schedule, link the resulting
	 * scheduled cusProduct back to it so the customer-products view shows the
	 * Stripe linkage and downstream actions (cancel, restore) can find it. */
	subscriptionId?: string;
	subscriptionScheduleId?: string;
	internalEntityId?: string;
}): FullCusProduct => {
	const startsAtSecondsPrecision = truncateMsToSecondPrecision(startsAt);
	const endsAtSecondsPrecision =
		endsAt === null || endsAt === undefined
			? undefined
			: truncateMsToSecondPrecision(endsAt);

	return initFullCustomerProduct({
		ctx,
		initContext: {
			fullCustomer,
			fullProduct,
			featureQuantities,
			customerLicenseQuantities,
			entity,
			resetCycleAnchor: startsAtSecondsPrecision,
			freeTrial: null,
			now: currentEpochMs,
			billingVersion: BillingVersion.V2,
		},
		initOptions: {
			startsAt: startsAtSecondsPrecision,
			endedAt: endsAtSecondsPrecision,
			status:
				accessStartsAt === undefined ? CusProductStatus.Scheduled : undefined,
			accessStartsAt,
			externalId,
			isCustom,
			billingCycleAnchorResetsAt,
			subscriptionId,
			subscriptionScheduleId,
			internalEntityId,
		},
	});
};
