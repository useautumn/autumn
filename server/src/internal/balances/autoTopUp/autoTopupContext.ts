import type {
	AutoTopup,
	AutoTopupLimitState,
	BillingContext,
	FullCusEntWithFullCusProduct,
} from "@autumn/shared";

export interface AutoTopupContext extends BillingContext {
	autoTopupConfig: AutoTopup;
	customerEntitlement: FullCusEntWithFullCusProduct; // The one-off prepaid cusEnt being topped up
	/** All cusEnts for this feature on the customer — used by the rebalancer to pay
	 * down overage on non-prepaid cusEnts before routing the remainder to the prepaid one. */
	customerEntitlements: FullCusEntWithFullCusProduct[];

	limitState: AutoTopupLimitState;
}
