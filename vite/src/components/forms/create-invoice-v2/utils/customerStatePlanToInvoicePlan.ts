import type { ProductItem, ProductV2 } from "@autumn/shared";
import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import {
	type FormInvoiceLicense,
	type FormInvoicePlan,
	newInvoiceLicense,
	newInvoicePlan,
} from "../createInvoiceFormSchema";

const includedUsageOf = (item: ProductItem | undefined) =>
	typeof item?.included_usage === "number" ? item.included_usage : 0;

/** Saved prepaid totals count included usage; an invoice bills only the paid units. */
const paidFeatureQuantities = ({
	prepaidOptions,
	items,
}: {
	prepaidOptions: Record<string, number>;
	items: ProductItem[];
}): Record<string, number> =>
	Object.fromEntries(
		Object.entries(prepaidOptions).flatMap(([featureId, total]) => {
			const item = items.find(
				(candidate) => candidate.feature_id === featureId,
			);
			const paid = total - includedUsageOf(item);
			return paid > 0 ? [[featureId, paid]] : [];
		}),
	);

const paidLicenses = ({
	licenseQuantities,
	product,
}: {
	licenseQuantities: Record<string, number>;
	product: ProductV2 | undefined;
}): FormInvoiceLicense[] =>
	Object.entries(licenseQuantities).flatMap(([licensePlanId, total]) => {
		const link = product?.licenses?.find(
			(candidate) => candidate.product.id === licensePlanId,
		);
		const paid = total - (link?.included ?? 0);
		return paid > 0
			? [{ ...newInvoiceLicense(licensePlanId), quantity: paid }]
			: [];
	});

/** A customer's saved plan as an invoice row, keeping its customisations and scope. */
export function customerStatePlanToInvoicePlan({
	plan,
	product,
}: {
	plan: CustomerStatePlan;
	product: ProductV2 | undefined;
}): FormInvoicePlan {
	return {
		...newInvoicePlan({ entityId: plan.entityId ?? null }),
		planId: plan.productId,
		version: plan.version,
		items: plan.items,
		isCustom: plan.isCustom,
		featureQuantities: paidFeatureQuantities({
			prepaidOptions: plan.prepaidOptions,
			items: plan.items ?? product?.items ?? [],
		}),
		licenses: paidLicenses({
			licenseQuantities: plan.licenseQuantities,
			product,
		}),
	};
}
