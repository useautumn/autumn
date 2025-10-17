import { Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useProductQueryState } from "@/views/products/product/hooks/useProductQuery";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useCusQuery } from "../../hooks/useCusQuery";
import { AttachModal } from "./AttachModal";
import { getAttachBody } from "./attachProductUtils";

export const AttachButton = () => {
	const axios = useAxiosInstance();
	const [open, setOpen] = useState(false);
	const [buttonLoading, setButtonLoading] = useState(false);

	const { customer } = useCusQuery();

	const { queryStates } = useProductQueryState();
	const { attachState, product, entityId } = useProductContext();
	const { buttonText, setPreview } = attachState;

	const handleAttachClicked = async () => {
		setButtonLoading(true);

		try {
			const res = await axios.post(
				"/v1/attach/preview",
				getAttachBody({
					customerId: customer.id || customer.internal_id,
					attachState,
					product,
					entityId,
					version: queryStates.version || product.version,
				}),
			);

			setPreview(res.data);
			setOpen(true);
		} catch (error) {
			console.log("error", error);
			toast.error(getBackendErr(error, "Failed to attach plan"));
		}

		setButtonLoading(false);
	};

	return (
		<>
			<AttachModal open={open} setOpen={setOpen} />
			<Button
				onClick={handleAttachClicked}
				variant="gradientPrimary"
				className="w-full gap-2"
				startIcon={<Upload size={12} />}
				disabled={attachState.buttonDisabled}
				isLoading={buttonLoading}
			>
				{buttonText}
			</Button>
		</>
	);
};
