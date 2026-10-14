import type { CancelAction } from "@autumn/shared";
import { CusProductStatus, type FullCusProduct } from "@autumn/shared";

export const computeCancelFields = ({
	cancelAction,
	currentCustomerProduct,
}: {
	cancelAction?: CancelAction;
	currentCustomerProduct: FullCusProduct;
}): {
	canceledAt: number | undefined;
	endedAt: number | undefined;
	status: CusProductStatus | undefined;
} => {
	const status =
		currentCustomerProduct.status === CusProductStatus.Active
			? CusProductStatus.Active
			: undefined;

	if (cancelAction === "uncancel") {
		return { canceledAt: undefined, endedAt: undefined, status };
	}

	return {
		canceledAt: currentCustomerProduct.canceled_at ?? undefined,
		endedAt: currentCustomerProduct.ended_at ?? undefined,
		status,
	};
};
