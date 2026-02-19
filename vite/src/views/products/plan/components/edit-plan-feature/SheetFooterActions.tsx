import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function SheetFooterActions({ hasChanges }: { hasChanges: boolean }) {
	const { setItem, handleUpdateProductItem } = useProductItemContext();
	const { initialItem } = useSheet();

	const handleDiscard = () => {
		if (initialItem) {
			setItem(initialItem);
		}
	};

	const handleUpdateItem = async () => {
		await handleUpdateProductItem();
	};

	return (
		<div className={cn("shrink-0 p-4 border-t border-border/40")}>
			<div className="flex gap-2 w-full">
				<Button
					variant="secondary"
					onClick={handleDiscard}
					disabled={!hasChanges}
					className="flex-1"
				>
					Discard
				</Button>
				<ShortcutButton
					metaShortcut="enter"
					onClick={handleUpdateItem}
					disabled={!hasChanges}
					className="flex-1"
				>
					Update Plan Feature
				</ShortcutButton>
			</div>
		</div>
	);
}
