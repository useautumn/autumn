import type { FrontendProduct, ProductItem } from "@autumn/shared";
import type { ItemDraftController } from "@/hooks/inline-editor/useItemDraftController";
import { getItemId } from "@/utils/product/productItemUtils";
import { reconcileThresholdBilling } from "../components/edit-plan-feature/advanced-settings/thresholdBillingItem";

/** Writes a feature-sheet edit to the open item draft, or straight onto the plan when there is no draft. */
export const applySheetItemEdit = ({
	nextItem,
	itemId,
	itemDraft,
	product,
	itemIndex,
	setProduct,
	onItemIdChange,
}: {
	nextItem: ProductItem;
	itemId: string | null;
	itemDraft: Pick<ItemDraftController, "enabled" | "session" | "updateItem">;
	product: FrontendProduct;
	itemIndex: number;
	setProduct: (product: FrontendProduct) => void;
	onItemIdChange: (itemId: string) => void;
}) => {
	// An edit that makes the item ineligible for threshold billing (e.g. a second tier) must drop it, or save 400s.
	const updatedItem = reconcileThresholdBilling({ item: nextItem });
	const session = itemDraft.session;
	const hasActiveDraft =
		itemDraft.enabled && session !== null && session.itemId === itemId;

	if (hasActiveDraft) {
		// Edits to feature type or interval change the item's derived id, so
		// resync it or the plan row stops matching and loses its selection.
		const newItemId = getItemId({
			item: updatedItem,
			itemIndex: session.itemIndex,
		});
		itemDraft.updateItem({ item: updatedItem, itemId: newItemId });
		if (newItemId !== itemId) onItemIdChange(newItemId);
		return;
	}

	if (!product.items || itemIndex === -1) return;

	const newItemId = getItemId({ item: updatedItem, itemIndex });
	if (newItemId !== itemId) onItemIdChange(newItemId);

	const updatedItems = [...product.items];
	updatedItems[itemIndex] = updatedItem;
	setProduct({ ...product, items: updatedItems });
};
