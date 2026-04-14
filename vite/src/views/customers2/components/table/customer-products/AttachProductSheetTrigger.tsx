import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";

export function AttachProductSheetTrigger() {
	const { setSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();

	const handleClick = () => {
		setSheet({ type: "attach-product-v2" });
	};
	return (
		<Button
			variant="primary"
			size="mini"
			className={cn(
				"gap-1 font-medium",
				isAttachingProduct && "z-90 opacity-70",
			)}
			onClick={handleClick}
		>
			<PlusIcon className="size-3.5" />
			Attach Plan
		</Button>
	);
}
