import type { ProductV2 } from "@autumn/shared";
import { PlusCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "@/components/v2/dialogs/Dialog";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { ProductConfig } from "../../ProductConfig";

const defaultProduct = {
	name: "",
	id: "",
	group: "",
	is_add_on: false,
	is_default: false,
};

function CreatePlanDialog({
	onSuccess,
	size = "default",
}: {
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	size?: "default" | "sm";
}) {
	const [loading, setLoading] = useState(false);
	const [product, setProduct] = useState(defaultProduct);
	const [open, setOpen] = useState(false);
	const idManuallyChangedRef = useRef(false);

	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();

	const handleCreateClicked = async () => {
		const productName = product.name?.trim() || "";

		if (!/^[a-zA-Z0-9 _-]+$/.test(productName)) {
			toast.error(
				!productName
					? "Plan name is required"
					: "Plan name can only contain alphanumeric characters, dashes (-), and underscores (_)",
			);
			return;
		}

		setLoading(true);
		try {
			const newProduct = await ProductService.createProduct(
				axiosInstance,
				product,
			);

			if (onSuccess) {
				await onSuccess(newProduct);
			} else {
				navigateTo(`/products/${newProduct.id}`, navigate);
			}
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create plan"));
		}
		setLoading(false);
	};

	useEffect(() => {
		if (open) {
			setProduct(defaultProduct);
			idManuallyChangedRef.current = false;
		}
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<IconButton icon={<PlusCircleIcon />} variant={"secondary"}>
					Add Plan
				</IconButton>
			</DialogTrigger>
			<DialogContent className="w-[500px]">
				<DialogTitle>Create Plan</DialogTitle>
				<ProductConfig
					product={product}
					setProduct={setProduct}
					isUpdate={false}
				/>

				<DialogFooter>
					<Button
						isLoading={loading}
						onClick={handleCreateClicked}
						variant="primary"
						className="min-w-44 w-44 max-w-44"
					>
						Create Plan
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default CreatePlanDialog;
