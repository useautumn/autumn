import type { FullCusProduct } from "@autumn/shared";
import { CheckCircle } from "@phosphor-icons/react";
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
		<Button variant="primary" onClick={handleUpdateClick}>
			<CheckCircle size={16} weight="duotone" />
			Update Plan
		</Button>
	);
}
