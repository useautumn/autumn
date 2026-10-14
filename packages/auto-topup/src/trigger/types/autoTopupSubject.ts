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

export type AutoTopupCustomerProduct = FullCusProductView &
	PlanControlCustomerProduct &
	Pick<CusProduct, "options" | "quantity" | "internal_product_id"> & {
		customer_prices: FullCustomerPrice[];
		customer_licenses?: FullCusProduct["customer_licenses"];
	};

export type AutoTopupCustomerEntitlement = FullCustomerEntitlementView &
	Pick<FullCustomerEntitlementView, "entitlement"> & {
		customer_product_id: string | null;
	};

export type AutoTopupSubject<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = FullSubjectView<CE, CP> & {
	customer: Pick<Customer, "config"> & { auto_topups?: AutoTopup[] | null };
};

export type AutoTopupFeatureRow<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = CE & { customer_product: (CP & { customer_entitlements: CE[] }) | null };

export type AutoTopupChargeSource<
	CE extends AutoTopupCustomerEntitlement = AutoTopupCustomerEntitlement,
	CP extends AutoTopupCustomerProduct = AutoTopupCustomerProduct,
> = CE & { customer_product: CP & { customer_entitlements: CE[] } };
