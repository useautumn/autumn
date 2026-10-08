import { type ProductItem, UsageModel } from "@autumn/shared";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import { invoiceQuantityRows, isPricedBothWays } from "./invoiceQuantityRows";

/** Usage models the invoice sheet shows a quantity field for. */
export const INVOICE_USAGE_MODELS = [UsageModel.Prepaid, UsageModel.PayPerUse];

const keepFeatures = <T>({
	entries,
	featureIds,
}: {
	entries: Record<string, T>;
	featureIds: Set<string>;
}): Record<string, T> =>
	Object.fromEntries(
		Object.entries(entries).filter(([featureId]) => featureIds.has(featureId)),
	);

/**
 * The plan editor's saved items replace the plan's own. Quantities for features
 * the edited plan no longer bills are dropped, so the invoice never charges them.
 */
export function applyInvoicePlanEditorItems({
	plan,
	items,
}: {
	plan: FormInvoicePlan;
	items: ProductItem[];
}): FormInvoicePlan {
	const billedFeatureIds = new Set(
		items.flatMap((item) =>
			item.feature_id &&
			item.usage_model &&
			INVOICE_USAGE_MODELS.includes(item.usage_model)
				? [item.feature_id]
				: [],
		),
	);

	const pricedBothWaysIds = new Set(
		invoiceQuantityRows({ items })
			.filter(isPricedBothWays)
			.map(({ featureId }) => featureId),
	);

	return {
		...plan,
		items,
		isCustom: true,
		overageQuantities: keepFeatures({
			entries: plan.overageQuantities,
			featureIds: pricedBothWaysIds,
		}),
		featureQuantities: keepFeatures({
			entries: plan.featureQuantities,
			featureIds: billedFeatureIds,
		}),
		featureUsage: keepFeatures({
			entries: plan.featureUsage,
			featureIds: billedFeatureIds,
		}),
	};
}
