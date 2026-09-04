import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
import { isCusEntExpired } from "./isCusEntExpired.js";

/** Expired by its own clock, or orphaned by a churned (expired) plan. */
export const isCusEntDisplayExpired = ({
	cusEnt,
	now,
}: {
	cusEnt: Pick<FullCusEntWithFullCusProduct, "expires_at" | "customer_product">;
	now?: number;
}): boolean =>
	isCusEntExpired({ cusEnt, now }) ||
	cusEnt.customer_product?.status === CusProductStatus.Expired;
