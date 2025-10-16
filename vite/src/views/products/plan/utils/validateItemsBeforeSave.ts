import type { FrontendProductItem } from "@autumn/shared";
import { toast } from "sonner";

export const validateItemsBeforeSave = (items: FrontendProductItem[]) => {
	for (const item of items) {
		if (item.isBasePrice) {
			if (typeof item.price !== "number" && !item.price) {
				toast.error("Base price cannot be empty");
				return false;
			}
		}
	}
	return true;
};
