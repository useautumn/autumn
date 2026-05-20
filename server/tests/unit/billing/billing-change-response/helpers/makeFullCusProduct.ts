import {
	CollectionMethod,
	CusProductStatus,
	type FullCusProduct,
} from "@autumn/shared";

export const makeFullCusProduct = ({
	planId,
	status = CusProductStatus.Active,
	startedAt,
	canceledAt = null,
	endedAt = null,
	id,
}: {
	planId: string;
	status?: CusProductStatus;
	startedAt?: number;
	canceledAt?: number | null;
	endedAt?: number | null;
	id?: string;
}): FullCusProduct => {
	return {
		id: id ?? `cp_${planId}`,
		internal_product_id: `internal_${planId}`,
		product_id: planId,
		internal_customer_id: "internal_cus_test",
		customer_id: "cus_test",
		created_at: 1_700_000_000_000,
		updated_at: null,
		status,
		canceled: canceledAt !== null,
		starts_at: startedAt ?? 1_700_000_000_000,
		canceled_at: canceledAt,
		ended_at: endedAt,
		options: [],
		collection_method: CollectionMethod.ChargeAutomatically,
		quantity: 1,
		api_semver: null,
		is_custom: false,
		external_id: null,
		customer_prices: [],
		customer_entitlements: [],
		product: { id: planId, name: planId } as FullCusProduct["product"],
	} as unknown as FullCusProduct;
};
