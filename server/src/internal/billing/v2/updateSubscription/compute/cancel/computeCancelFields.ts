import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { CancelMode } from "@/internal/billing/v2/types/cancelTypes";

/**
 * Computes cancel-related fields for a new customer product.
 * When uncanceling, returns undefined values to clear the cancel state.
 * Otherwise, preserves the cancel state from the current product.
 * Always preserves active status when replacing an active product.
 */
export const computeCancelFields = ({
	cancelMode,
	currentCustomerProduct,
}: {
	cancelMode?: CancelMode;
	currentCustomerProduct: FullCusProduct;
}): {
	canceledAt: number | undefined;
	endedAt: number | undefined;
	status: CusProductStatus | undefined;
} => {
	// When replacing an active product, preserve the active status
	// This ensures the replacement product is also active (not scheduled due to timing)
	const status =
		currentCustomerProduct.status === CusProductStatus.Active
			? CusProductStatus.Active
			: undefined;

	if (cancelMode === "uncancel") {
		return { canceledAt: undefined, endedAt: undefined, status };
	}

	return {
		canceledAt: currentCustomerProduct.canceled_at ?? undefined,
		endedAt: currentCustomerProduct.ended_at ?? undefined,
		status,
	};
};
