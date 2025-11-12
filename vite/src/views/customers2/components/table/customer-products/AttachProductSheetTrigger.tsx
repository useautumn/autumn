import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";

export function AttachProductSheetTrigger() {
	const { setSheet, closeSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();

	const handleClick = () => {
		if (isAttachingProduct) {
			closeSheet();
		} else {
			setSheet({ type: "attach-product" });
		}
	};
	return (
		<Button
			variant="primary"
			size="mini"
			className="gap-1 font-medium"
			onClick={handleClick}
		>
			<PlusIcon className="size-3.5" />
			Attach Plan
		</Button>
	);
}
