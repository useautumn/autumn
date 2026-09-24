import type {
	AutoTopup,
	CusProduct,
	Customer,
	FullCusProduct,
	FullCusProductView,
	FullCustomerEntitlementView,
	FullCustomerPrice,
	FullSubjectView,
	PlanControlCustomerProduct,
} from "@autumn/shared";

/** A product row as the trigger reads it: its plan controls, its prices, and when it was attached. */
export type AutoTopupCustomerProduct = FullCusProductView &
	PlanControlCustomerProduct &
	Pick<CusProduct, "options" | "quantity" | "internal_product_id"> & {
		customer_prices: FullCustomerPrice[];
		customer_licenses?: FullCusProduct["customer_licenses"];
	};

/** A balance row with the product it charges through, if any. */
export type AutoTopupCustomerEntitlement = FullCustomerEntitlementView &
	Pick<FullCustomerEntitlementView, "entitlement"> & {
		customer_product_id: string | null;
	};

/**
 * What deciding a top-up reads of a subject. Generic over the row shapes so a server FullSubject
 * yields server rows and the worker's view yields worker rows; both satisfy the bounds.
 */
export type AutoTopupSubject<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = FullSubjectView<CE, CP> & {
	customer: Pick<Customer, "config"> & { auto_topups?: AutoTopup[] | null };
};

/** A selected row with the product the selection attached, or null for a loose grant. */
export type AutoTopupFeatureRow<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = CE & { customer_product: (CP & { customer_entitlements: CE[] }) | null };

/** A selected row with the product the selection attached. */
export type AutoTopupChargeSource<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = CE & { customer_product: CP & { customer_entitlements: CE[] } };
