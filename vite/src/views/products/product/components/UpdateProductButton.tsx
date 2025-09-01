import { Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductContext } from "@/views/products/product/ProductContext";

export const UpdateProductButton = () => {
	const [_open, _setOpen] = useState(false);
	// const [loading, setLoading] = useState(false);

	const { handleCreateProduct, actionState, buttonLoading, setButtonLoading } =
		useProductContext();

	return (
		<Button
			onClick={async () => {
				setButtonLoading(true);
				await handleCreateProduct(false);
				setButtonLoading(false);
			}}
			variant="gradientPrimary"
			className="w-full gap-2"
			isLoading={buttonLoading}
			disabled={actionState.disabled}
			startIcon={<Upload size={12} />}
		>
			{actionState.buttonText}
		</Button>
	);
};
