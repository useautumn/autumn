import { PlanItemsSection } from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
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
		handleEditPlan,
		previewDiff,
	} = useAttachFormContext();

	const hideEditButton = readOnly || formValues.grantFree;
	const { prepaidOptions } = formValues;

	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const outgoingItems = showDiff ? previewDiff.outgoingItems : [];

	const originalItemsForDiff =
		outgoingItems.length > 0 ? outgoingItems : productTemplateItems;

	const shouldShowDiff = showDiff
		? outgoingItems.length > 0 || hasCustomizations
		: false;

	if (!product) return null;

	const planItemsProps = {
		product,
		originalItems: originalItemsForDiff,
		features,
		prepaidOptions,
		initialPrepaidOptions,
		form,
		showDiff: shouldShowDiff,
		currency,
		onEditPlan: handleEditPlan,
		gateDeletedItemsByDiff: true,
		readOnly: hideEditButton,
	} as const;

	const titleContent = readOnly ? (
		<h3 className="text-sub select-none w-full">{product.name}</h3>
	) : (
		<h3 className="text-sub select-none w-full">
			<AttachSectionTitle />
		</h3>
	);

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-1">
				{titleContent}
				<PlanItemsSection {...planItemsProps} />
			</div>
		</SheetSection>
	);
}
