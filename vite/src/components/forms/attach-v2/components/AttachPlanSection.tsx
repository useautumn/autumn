import { useMemo } from "react";
import { PlanItemsSection } from "@/components/forms/shared";
import { PlanEditButton } from "@/components/forms/shared/plan-items/PlanEditButton";
import { PlanLicenseItemsSections } from "@/components/forms/shared/plan-items/PlanLicenseItemsSections";
import { usePlanLicenseRows } from "@/components/forms/shared/plan-items/PlanLicensesSummary";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachSectionTitle } from "./AttachSectionTitle";

export function AttachPlanSection({
	readOnly,
	showDiff,
}: {
	readOnly?: boolean;
	showDiff?: boolean;
} = {}) {
	const {
		form,
		formValues,
		features,
		originalItems: productTemplateItems,
		productWithFormItems: product,
		hasCustomizations,
		initialPrepaidOptions,
		previewPrepaidOptions,
		handleEditPlan,
		previewDiff,
		attachCurrency,
	} = useAttachFormContext();

	const hideEditButton = readOnly || formValues.grantFree;
	const { prepaidOptions, licenseQuantities } = formValues;

	// Review keeps the staged totals visible read-only; grant-free hides them.
	const licenseQuantityEditor = formValues.grantFree
		? undefined
		: { form, quantities: licenseQuantities, readOnly: hideEditButton };

	const effectiveInitialPrepaidOptions = readOnly
		? previewPrepaidOptions
		: initialPrepaidOptions;

	const { displayCurrency: currency, orgDefaultCurrency } = attachCurrency;

	const displayProduct = useMemo(
		() =>
			product && {
				...product,
				items: productItemsForCurrency({
					items: product.items,
					currency,
					orgDefaultCurrency,
				}),
			},
		[product, currency, orgDefaultCurrency],
	);

	const originalItemsForDiff = useMemo(
		() =>
			showDiff && previewDiff.outgoingItems.length > 0
				? previewDiff.outgoingItems
				: productTemplateItems,
		[showDiff, previewDiff.outgoingItems, productTemplateItems],
	);

	const displayOriginalItems = useMemo(
		() =>
			originalItemsForDiff &&
			productItemsForCurrency({
				items: originalItemsForDiff,
				currency,
				orgDefaultCurrency,
			}),
		[originalItemsForDiff, currency, orgDefaultCurrency],
	);

	const shouldShowDiff = showDiff
		? previewDiff.hasOutgoingPlans || hasCustomizations
		: false;
	const outgoingLicensesForDiff =
		showDiff && previewDiff.hasOutgoingPlans
			? previewDiff.outgoingLicenses
			: undefined;

	const { rows: licenseRows } = usePlanLicenseRows({
		planId: product?.id,
		addLicenses: formValues.addLicenses,
		outgoingLicenses: outgoingLicensesForDiff,
		features,
	});
	const hasLicenseRows = licenseRows.length > 0;

	if (!displayProduct || !product) return null;

	const planItemsProps = {
		product: displayProduct,
		originalItems: displayOriginalItems,
		features,
		prepaidOptions,
		initialPrepaidOptions: effectiveInitialPrepaidOptions,
		form,
		showDiff: shouldShowDiff,
		currency,
		addLicenses: formValues.addLicenses,
		licenseQuantityEditor,
		outgoingLicenses: outgoingLicensesForDiff,
		onEditPlan: handleEditPlan,
		gateDeletedItemsByDiff: true,
		readOnly: hideEditButton,
		showEditButton: !hasLicenseRows,
		adminIds: {
			stripe_product_id: product.stripe_id ?? null,
			internal_product_id: product.internal_id ?? null,
		},
	} as const;

	const titleContent = readOnly ? (
		<h3 className="text-sub select-none w-full">{product.name}</h3>
	) : (
		<h3 className="text-sub select-none w-full">
			<AttachSectionTitle />
		</h3>
	);

	return (
		<>
			<SheetSection withSeparator>
				<div className="flex flex-col gap-1">
					{titleContent}
					<PlanItemsSection {...planItemsProps} />
				</div>
			</SheetSection>
			<PlanLicenseItemsSections
				planId={product.id}
				addLicenses={formValues.addLicenses}
				features={features}
				currency={currency}
				showDiff={shouldShowDiff}
				outgoingLicenses={outgoingLicensesForDiff}
			/>
			{!hideEditButton && hasLicenseRows && (
				<SheetSection withSeparator>
					<PlanEditButton onEditPlan={handleEditPlan} />
				</SheetSection>
			)}
		</>
	);
}
