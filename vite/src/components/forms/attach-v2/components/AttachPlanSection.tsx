import {
	ACTIVE_STATUSES,
	type CusProduct,
	CusProductStatus,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { useMemo } from "react";
import { PlanItemsSection } from "@/components/forms/shared";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { AttachSectionTitle } from "./AttachSectionTitle";

/**
 * Computes outgoing product items from client-side data (instant, no API call).
 * Finds active customer products in the same group as the incoming product
 * and returns their items for diff comparison.
 *
 * we should replace this later on with the result of preview_attach, and then move this diff to the second stage
 * on sheet load, it will just show empty items, then on clicking preview changes, we'll see the diff
 */
function getClientOutgoingItems({
	incomingProduct,
	customerProducts,
	allProducts,
}: {
	incomingProduct: ProductV2 | undefined;
	customerProducts: CusProduct[] | undefined;
	allProducts: ProductV2[];
}): ProductItem[] {
	if (!incomingProduct || !customerProducts) return [];

	const incomingGroup = incomingProduct.group ?? "";

	const activeStatuses = new Set<string>([
		...ACTIVE_STATUSES,
		CusProductStatus.Trialing,
	]);

	const outgoingItems: ProductItem[] = [];

	for (const customerProduct of customerProducts) {
		if (!activeStatuses.has(customerProduct.status)) continue;

		const matchingProduct = allProducts.find(
			(p) => p.id === customerProduct.product_id && !p.is_add_on,
		);
		if (!matchingProduct) continue;
		if ((matchingProduct.group ?? "") !== incomingGroup) continue;

		outgoingItems.push(...matchingProduct.items);
	}

	return outgoingItems;
}

export function AttachPlanSection({ readOnly }: { readOnly?: boolean } = {}) {
	const {
		form,
		formValues,
		features,
		originalItems: productTemplateItems,
		product: incomingProduct,
		productWithFormItems: product,
		hasCustomizations,
		initialPrepaidOptions,
		handleEditPlan,
	} = useAttachFormContext();

	const hideEditButton = readOnly || formValues.grantFree;

	const { prepaidOptions } = formValues;

	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";

	const { customer } = useCusQuery();
	const { products: allProducts } = useProductsQuery();

	const outgoingItems = useMemo(
		() =>
			getClientOutgoingItems({
				incomingProduct,
				customerProducts: customer?.customer_products as
					| CusProduct[]
					| undefined,
				allProducts,
			}),
		[incomingProduct, customer?.customer_products, allProducts],
	);

	const originalItemsForDiff =
		outgoingItems.length > 0 ? outgoingItems : productTemplateItems;

	const showDiffs = readOnly
		? false
		: hasCustomizations || outgoingItems.length > 0;

	if (!product) return null;

	// Common props for PlanItemsSection
	const planItemsProps = {
		product,
		originalItems: originalItemsForDiff,
		features,
		prepaidOptions,
		initialPrepaidOptions,
		form,
		hasCustomizations: showDiffs,
		currency,
		onEditPlan: handleEditPlan,
		gateDeletedItemsByCustomizations: true,
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
