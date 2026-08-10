import type { ProductItem, RolloverConfig } from "@autumn/shared";
import { toast } from "sonner";

export const checkRolloverConfigValid = (
	rollover: RolloverConfig | null | undefined,
	showToast = true,
) => {
	if (!rollover) return true;
	if (rollover.max_percentage != null) return true;
	if (rollover.max != null && rollover.max <= 0) {
		if (showToast) {
			toast.error("Set a maximum rollover amount greater than 0");
		}
		return false;
	}
	return true;
};

export const checkItemRolloverValid = (item: ProductItem, showToast = true) =>
	checkRolloverConfigValid(
		item.config?.rollover as RolloverConfig | null | undefined,
		showToast,
	);
