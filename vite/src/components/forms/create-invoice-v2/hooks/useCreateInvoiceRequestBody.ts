import type {
	CreateInvoiceParams,
	InvoiceLicenseQuantity,
	InvoicePlanParams,
	ProductItem,
} from "@autumn/shared";
import { useMemo } from "react";
import { convertToInvoiceFeatureQuantities } from "@/utils/billing/invoiceQuantityUtils";
import {
	type FormDiscount,
	filterValidDiscounts,
} from "../../attach-v2/utils/discountUtils";
import type {
	CreateInvoiceForm,
	FormInvoiceLicense,
	FormInvoicePlan,
} from "../createInvoiceFormSchema";

const isBasePriceItem = (item: ProductItem) => !item.feature_id;

const toDiscounts = ({ discounts }: { discounts: FormDiscount[] }) => {
	const valid = filterValidDiscounts(discounts);
	return valid.length > 0 ? valid : undefined;
};

const toLicenseQuantity = ({
	license,
	items,
}: {
	license: FormInvoiceLicense;
	items: ProductItem[] | null;
}): InvoiceLicenseQuantity | null => {
	if (!license.licensePlanId || license.quantity === undefined) return null;

	return {
		license_plan_id: license.licensePlanId,
		quantity: license.quantity,
		feature_quantities: convertToInvoiceFeatureQuantities({
			quantities: license.featureQuantities,
			usageEntries: license.featureUsage,
			items,
		}),
		...(license.prorate === undefined ? {} : { prorate: license.prorate }),
	};
};

const toPlanParams = ({
	plan,
	catalogItems,
}: {
	plan: FormInvoicePlan;
	catalogItems: ProductItem[] | undefined;
}): InvoicePlanParams | null => {
	if (!plan.planId) return null;

	// An uncustomized plan has no items, so behavior comes from the catalog plan.
	const pricedItems = plan.items ?? catalogItems ?? null;

	const licenses = plan.licenses
		.map((license) => toLicenseQuantity({ license, items: pricedItems }))
		.filter((license): license is InvoiceLicenseQuantity => license !== null);

	// Removing the base-price item in the editor is how a caller drops that line.
	const customizeItems = plan.isCustom ? plan.items : null;
	const dropsBasePrice =
		customizeItems !== null && !customizeItems.some(isBasePriceItem);
	const customize = customizeItems
		? {
				...(dropsBasePrice ? { price: null } : {}),
				items: customizeItems,
			}
		: undefined;

	return {
		plan_id: plan.planId,
		...(plan.version === undefined ? {} : { version: plan.version }),
		...(customize
			? { customize: customize as InvoicePlanParams["customize"] }
			: {}),
		feature_quantities: convertToInvoiceFeatureQuantities({
			quantities: plan.featureQuantities,
			usageEntries: plan.featureUsage,
			items: pricedItems,
		}),
		...(licenses.length > 0 ? { license_quantities: licenses } : {}),
		...(plan.prorate === undefined ? {} : { prorate: plan.prorate }),
	};
};

/** Extracted from the hook so the mapping is unit-testable. */
export function buildCreateInvoiceRequestBody({
	customerId,
	form,
	preview,
	catalogItemsByPlanId,
}: {
	customerId: string | undefined;
	form: CreateInvoiceForm;
	preview?: boolean;
	catalogItemsByPlanId?: Map<string, ProductItem[] | undefined>;
}): CreateInvoiceParams | null {
	if (!customerId) return null;

	const plans = form.plans
		.map((plan) =>
			toPlanParams({
				plan,
				catalogItems: catalogItemsByPlanId?.get(plan.planId),
			}),
		)
		.filter((plan): plan is InvoicePlanParams => plan !== null);

	const customLineItems = form.customLineItems
		.filter((item) => item.description.trim() !== "" && item.amount !== "")
		.map((item) => ({
			description: item.description.trim(),
			amount: Number(item.amount),
		}));

	if (plans.length === 0 && customLineItems.length === 0) return null;

	const hasPeriod = form.periodStart !== null && form.periodEnd !== null;
	const discounts = toDiscounts({ discounts: form.discounts });

	return {
		customer_id: customerId,
		...(plans.length > 0 ? { plans } : {}),
		...(customLineItems.length > 0
			? { custom_line_items: customLineItems }
			: {}),
		...(discounts ? { discounts } : {}),
		...(form.invoiceTemplateId
			? { invoice_template_id: form.invoiceTemplateId }
			: {}),
		...(form.netTermsDays ? { net_terms_days: form.netTermsDays } : {}),
		...(form.taxRateId ? { tax_rate_id: form.taxRateId } : {}),
		...(hasPeriod
			? { period_start: form.periodStart, period_end: form.periodEnd }
			: {}),
		...(preview ? { preview: true } : {}),
	} as CreateInvoiceParams;
}

export function useCreateInvoiceRequestBody({
	customerId,
	form,
	preview,
	catalogItemsByPlanId,
}: {
	customerId: string | undefined;
	form: CreateInvoiceForm;
	preview?: boolean;
	catalogItemsByPlanId?: Map<string, ProductItem[] | undefined>;
}) {
	return useMemo(
		() =>
			buildCreateInvoiceRequestBody({
				customerId,
				form,
				preview,
				catalogItemsByPlanId,
			}),
		[customerId, form, preview, catalogItemsByPlanId],
	);
}
