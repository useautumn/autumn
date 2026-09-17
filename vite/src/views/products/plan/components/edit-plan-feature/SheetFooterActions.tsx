import {
	useSetCurrentItem,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { PlanSheetFooter } from "@/components/v2/sheets/PlanSheetFooter";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";
import { checkItemCurrenciesValid } from "../../utils/currencyUtils";
import { checkRolloverConfigValid } from "../../utils/rolloverUtils";
import { reconcileThresholdBilling } from "./advanced-settings/thresholdBillingItem";

export function SheetFooterActions({
	isDirty,
	canConfirm,
	onBeforeCommit,
}: {
	isDirty: boolean;
	canConfirm: boolean;
	onBeforeCommit?: () => void;
}) {
	const { item, setItem, handleUpdateProductItem } = useProductItemContext();
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
		if (item && !checkRolloverConfigValid(item.config?.rollover)) return;
		// An item edited out of threshold eligibility keeps its stale threshold,
		// which the API rejects — drop it before the item is committed.
		if (item) {
			const reconciled = reconcileThresholdBilling({ item });
			if (reconciled !== item) setItem(reconciled);
		}
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
