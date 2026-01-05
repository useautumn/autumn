import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function SheetFooterActions() {
	const { setItem } = useProductItemContext();
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const initialItem = useSheetStore((s) => s.initialItem);

	const handleDiscard = () => {
		if (initialItem) {
			setItem(initialItem);
		}
	};

	const handleUpdateItem = () => {
		closeSheet();
	};

	return (
		<div
			className={cn(
				"shrink-0 p-4 border-t border-border/40 transition-all animate-in slide-in-from-bottom-2 duration-200 ease-in fade-in",
			)}
		>
			<div className="flex gap-2 w-full">
				<Button variant="secondary" onClick={handleDiscard} className="flex-1">
					Discard
				</Button>
				<ShortcutButton
					metaShortcut="enter"
					onClick={handleUpdateItem}
					className="flex-1"
				>
					Update Plan Feature
				</ShortcutButton>
			</div>
		</div>
	);
}
