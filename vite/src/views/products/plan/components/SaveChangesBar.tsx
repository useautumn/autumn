import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { useProductChangedAlert } from "@/components/v2/hooks";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useProductStore,
	useWillVersion,
} from "@/hooks/stores/useProductStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductCountsQuery } from "../../product/hooks/queries/useProductCountsQuery";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { updateProduct } from "../../product/utils/updateProduct";

interface SaveChangesBarProps {
	isOnboarding?: boolean;
}

export const SaveChangesBar = ({
	isOnboarding = false,
}: SaveChangesBarProps) => {
	const axiosInstance = useAxiosInstance();
	const { setShowNewVersionDialog } = useProductContext();

	// Get product state from store
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const hasChanges = useHasChanges();
	const willVersion = useWillVersion();

	const [saving, setSaving] = useState(false);

	const { refetch } = useProductsQuery();
	const { counts, isLoading } = useProductCountsQuery();
	const { refetch: queryRefetch } = useProductQuery();

	const { modal } = useProductChangedAlert({
		hasChanges,
		disabled: isOnboarding, // Disable navigation blocking in onboarding mode
	});

	const handleSaveClicked = async () => {
		if (!isOnboarding && isLoading) {
			toast.error("Product counts are loading");
			return;
		}

		if (!isOnboarding && counts?.all > 0 && willVersion) {
			setShowNewVersionDialog(true);
			return;
		}

		setSaving(true);
		const result = await updateProduct({
			axiosInstance,
			productId: product.id,
			product,
			onSuccess: async () => {
				if (isOnboarding) {
					await refetch();
				} else {
					await queryRefetch();
				}
			},
		});

		// Only show success toast if update was successful
		if (result) {
			toast.success("Changes saved successfully");
		}

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		const baseProduct = useProductStore.getState().baseProduct;
		if (baseProduct) {
			setProduct(baseProduct);
		}
	};

	if (!hasChanges) return null;

	return (
		<>
			{modal}
			<div className="w-full flex justify-center items-center h-20 mb-10">
				<div
					className={`flex items-center gap-2 p-2 pl-3 rounded-xl border border-input bg-white ${
						isOnboarding ? "shadow-lg" : ""
					}`}
				>
					<p className="text-body whitespace-nowrap truncate">
						You have unsaved changes
					</p>
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
		</>
	);
};
