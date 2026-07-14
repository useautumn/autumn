import {
	useSetCurrentItem,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { PlanSheetFooter } from "@/components/v2/sheets/PlanSheetFooter";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { checkItemCurrenciesValid } from "../../utils/currencyUtils";

export function SheetFooterActions({
	isDirty,
	canConfirm,
	onBeforeCommit,
}: {
	isDirty: boolean;
	canConfirm: boolean;
	onBeforeCommit?: () => void;
}) {
	const { item, handleUpdateProductItem } = useProductItemContext();
	const { initialItem, itemDraft, closeSheet } = useSheet();
	const setCurrentItem = useSetCurrentItem();

	const handleDiscard = () => {
		if (itemDraft.session) {
			itemDraft.discardItem();
			return;
		}
		if (initialItem) {
			setCurrentItem(initialItem);
		}
	};

	const handleUpdateItem = async () => {
		if (item && !checkItemCurrenciesValid(item)) return;
		await onBeforeCommit?.();
		await handleUpdateProductItem();
	};

	return (
		<PlanSheetFooter
			isDirty={isDirty}
			onDiscard={handleDiscard}
			onClose={closeSheet}
			onConfirm={handleUpdateItem}
			confirmLabel="Save"
			confirmDisabled={!canConfirm}
		/>
	);
}
