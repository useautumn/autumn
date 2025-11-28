import type { FullCusProduct } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

interface UpdatePlanButtonProps {
	cusProduct: FullCusProduct;
}

export function UpdatePlanButton({ cusProduct }: UpdatePlanButtonProps) {
	const setSheet = useSheetStore((s) => s.setSheet);

	const handleUpdateClick = () => {
		// Open the subscription update sheet with the customer product ID
		setSheet({
			type: "subscription-update",
			itemId: cusProduct.id || cusProduct.internal_product_id,
		});
	};

	return (
		<Button variant="skeleton" onClick={handleUpdateClick}>
			<ArrowRightIcon size={16} weight="duotone" />
			Go to Checkout
		</Button>
	);
}
