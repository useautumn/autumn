import { type ProductItem, UsageModel } from "@autumn/shared";
import type { FormInvoicePlan } from "../createInvoiceFormSchema";
import {
	type InvoiceQuantityRow,
	invoiceQuantityRows,
} from "./invoiceQuantityRows";

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

const rowsByFeatureId = (items: ProductItem[]) =>
	new Map(invoiceQuantityRows({ items }).map((row) => [row.featureId, row]));

/** Each quantity stays with the price it was entered for, so a removed price's units are never billed on another. */
function carryQuantities({
	plan,
	previous,
	next,
}: {
	plan: FormInvoicePlan;
	previous: Map<string, InvoiceQuantityRow>;
	next: Map<string, InvoiceQuantityRow>;
}) {
	const featureQuantities: Record<string, number> = {};
	const overageQuantities: Record<string, number> = {};
	for (const [featureId, nextRow] of next) {
		const previousRow = previous.get(featureId);
		if (!previousRow) continue;

		const quantity = plan.featureQuantities[featureId];
		const prepaidUnits = previousRow.prepaid ? quantity : undefined;
		const usageUnits = previousRow.prepaid
			? plan.overageQuantities[featureId]
			: quantity;

		const primary = nextRow.prepaid ? prepaidUnits : usageUnits;
		if (primary !== undefined) featureQuantities[featureId] = primary;
		if (nextRow.prepaid && nextRow.usage && usageUnits !== undefined) {
			overageQuantities[featureId] = usageUnits;
		}
	}
	return { featureQuantities, overageQuantities };
}

/**
 * The plan editor's saved items replace the plan's own. Quantities for features
 * the edited plan no longer bills are dropped, so the invoice never charges them.
 */
export function applyInvoicePlanEditorItems({
	plan,
	previousItems,
	items,
}: {
	plan: FormInvoicePlan;
	previousItems: ProductItem[];
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

	return {
		...plan,
		items,
		isCustom: true,
		...carryQuantities({
			plan,
			previous: rowsByFeatureId(previousItems),
			next: rowsByFeatureId(items),
		}),
		featureUsage: keepFeatures({
			entries: plan.featureUsage,
			featureIds: billedFeatureIds,
		}),
	};
}
