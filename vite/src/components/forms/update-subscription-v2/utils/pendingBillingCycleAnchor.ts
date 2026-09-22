import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { UpdateSubscriptionForm } from "../updateSubscriptionFormSchema";

type BillingCycleAnchorFormValues = Pick<
	UpdateSubscriptionForm,
	"resetBillingCycle" | "billingCycleAnchorMode" | "billingCycleAnchorDate"
>;

export function getPendingBillingCycleAnchor({
	cusProduct,
	nowMs,
}: {
	cusProduct: FullCusProduct;
	nowMs: number;
}): number | null {
	const resetsAt = cusProduct.billing_cycle_anchor_resets_at;
	if (typeof resetsAt !== "number" || resetsAt <= nowMs) return null;
	if (cusProduct.status === CusProductStatus.Expired) return null;
	return resetsAt;
}

export function pendingBillingCycleAnchorFormDefaults({
	cusProduct,
	nowMs,
}: {
	cusProduct: FullCusProduct;
	nowMs: number;
}): BillingCycleAnchorFormValues {
	const resetsAt = getPendingBillingCycleAnchor({ cusProduct, nowMs });
	if (resetsAt === null) {
		return {
			resetBillingCycle: false,
			billingCycleAnchorMode: "now",
			billingCycleAnchorDate: null,
		};
	}
	return {
		resetBillingCycle: true,
		billingCycleAnchorMode: "custom",
		billingCycleAnchorDate: resetsAt,
	};
}

export function billingCycleAnchorChanged({
	formValues,
	pendingResetsAt,
}: {
	formValues: BillingCycleAnchorFormValues;
	pendingResetsAt: number | null;
}): boolean {
	if (pendingResetsAt === null) return formValues.resetBillingCycle;
	return (
		!formValues.resetBillingCycle ||
		formValues.billingCycleAnchorMode !== "custom" ||
		formValues.billingCycleAnchorDate !== pendingResetsAt
	);
}
