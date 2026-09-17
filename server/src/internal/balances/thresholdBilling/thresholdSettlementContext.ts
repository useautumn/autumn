import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	FullCustomerPrice,
} from "@autumn/shared";

export interface ThresholdSettlementContext extends BillingContext {
	customerEntitlement: FullCusEntWithFullCusProduct;
	customerProduct: FullCusProduct;
	customerPrice: FullCustomerPrice;
	chargeUnits: number;
}
