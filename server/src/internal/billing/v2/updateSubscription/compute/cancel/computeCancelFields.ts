import type { FullCusProduct } from "@autumn/shared";
import type { CancelMode } from "@/internal/billing/v2/types/cancelTypes";

/**
 * Computes cancel-related fields for a new customer product.
 * When uncanceling, returns undefined values to clear the cancel state.
 * Otherwise, preserves the cancel state from the current product.
 */
export const computeCancelFields = ({
	cancelMode,
	currentCustomerProduct,
}: {
	cancelMode?: CancelMode;
	currentCustomerProduct: FullCusProduct;
}): { canceledAt: number | undefined; endedAt: number | undefined } => {
	if (cancelMode === "uncancel") {
		return { canceledAt: undefined, endedAt: undefined };
	}

	return {
		canceledAt: currentCustomerProduct.canceled_at ?? undefined,
		endedAt: currentCustomerProduct.ended_at ?? undefined,
	};
};
