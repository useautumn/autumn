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

interface SaveChangesBarProps {
	isOnboarding?: boolean;
	originalProduct?: FrontendProduct;
	setOriginalProduct?: (product: FrontendProduct) => void;
}

export const SaveChangesBar = ({
	isOnboarding = false,
	originalProduct: onboardingOriginalProduct,
	setOriginalProduct: setOnboardingOriginalProduct,
}: SaveChangesBarProps) => {
	const axiosInstance = useAxiosInstance();
	const {
		diff,
		setProduct,
		product,
		setShowNewVersionDialog,
		refetch: contextRefetch,
	} = useProductContext();
	const [saving, setSaving] = useState(false);

	const { counts, isLoading } = useProductCountsQuery();
	const { refetch: queryRefetch, product: queryOriginalProduct } =
		useProductQuery();

	const originalProduct = isOnboarding
		? onboardingOriginalProduct
		: queryOriginalProduct;

	const handleSaveClicked = async () => {
		if (!isOnboarding && isLoading) {
			toast.error("Product counts are loading");
			return;
		}

		if (!isOnboarding && counts?.all > 0 && diff.willVersion) {
			setShowNewVersionDialog(true);
			return;
		}

		setSaving(true);
		await updateProduct({
			axiosInstance,
			product,
			onSuccess: async () => {
				if (isOnboarding) {
					// Use the unified refetch from context (hybrid approach)
					if (contextRefetch) {
						await contextRefetch();
					} else if (setOnboardingOriginalProduct && product) {
						// Fallback: manual product update (should not be needed with hybrid approach)
						const response = await axiosInstance.get(
							`/products/${product.id}/data2`,
						);
						setOnboardingOriginalProduct(response.data.product);
					}
				} else {
					// Normal PEV refetch
					await queryRefetch();
				}
			},
		});

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		setProduct(originalProduct as FrontendProduct);
	};

	if (!diff.hasChanges) return null;

	return (
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
	);
};
