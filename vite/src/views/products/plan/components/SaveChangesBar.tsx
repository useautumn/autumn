import type { FrontendProduct } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { updateProduct } from "../../product/utils/updateProduct";

export const SaveChangesBar = () => {
	const axiosInstance = useAxiosInstance();
	const { hasChanges, willVersion, setProduct } = useProductContext();
	const [saving, setSaving] = useState(false);
	const { product, setShowNewVersionDialog } = useProductContext();
	const { counts, isLoading } = useProductCountsQuery();
	const { refetch } = useProductQuery();
	const { product: orgiinalProduct } = useProductQuery();

	const handleSaveClicked = async () => {
		if (isLoading) toast.error("Product counts are loading");

		if (counts?.all > 0 && willVersion) {
			setShowNewVersionDialog(true);
			return;
		}

		setSaving(true);
		await updateProduct({
			axiosInstance,
			product,
			onSuccess: async () => {
				await refetch();
			},
		});

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		setProduct(orgiinalProduct as FrontendProduct);
	};

	if (!hasChanges) return null;

	return (
		<div className="w-full flex justify-center items-center h-20 mb-10">
			<div className="flex items-center gap-2 p-2 pl-3 rounded-xl border border-input bg-white">
				<p className="text-body">You have unsaved changes</p>
				<Button variant="secondary" onClick={handleDiscardClicked}>
					Discard
				</Button>
				<ShortcutButton
					metaShortcut="s"
					onClick={handleSaveClicked}
					isLoading={saving}
				>
					Save
				</ShortcutButton>
			</div>
		</div>
	);
};
