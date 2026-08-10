import type { ProductItem, RolloverConfig } from "@autumn/shared";
import { toast } from "sonner";

// Mirrors the server's rollover rules in validateProductItems so saves fail fast.
export const checkRolloverConfigValid = (
	rollover: RolloverConfig | null | undefined,
	showToast = true,
) => {
	if (!rollover) return true;

	const fail = (message: string) => {
		if (showToast) toast.error(message);
		return false;
	};

	if (rollover.max != null && rollover.max_percentage != null) {
		return fail(
			"Set either a maximum rollover amount or a percentage, not both",
		);
	}

	if (rollover.max_percentage != null) {
		if (rollover.max_percentage <= 0 || rollover.max_percentage > 100) {
			return fail("Maximum rollover percentage must be between 1 and 100");
		}
		return true;
	}

	if (rollover.max != null && rollover.max <= 0) {
		return fail("Set a maximum rollover amount greater than 0");
	}

	return true;
};

export const checkItemRolloverValid = (item: ProductItem, showToast = true) =>
	checkRolloverConfigValid(
		item.config?.rollover as RolloverConfig | null | undefined,
		showToast,
	);
