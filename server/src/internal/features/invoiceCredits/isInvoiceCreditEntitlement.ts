import {
	type EntitlementWithFeature,
	type Price,
	toProductItem,
} from "@autumn/shared";
import { isInvoiceCreditItem } from "./isInvoiceCreditItem.js";

export const isInvoiceCreditEntitlement = ({
	entitlement,
	price,
}: {
	entitlement: EntitlementWithFeature;
	price?: Price | null;
}): boolean => {
	if (!price) return false;
	return isInvoiceCreditItem({
		item: toProductItem({ ent: entitlement, price }),
		feature: entitlement.feature,
	});
};
