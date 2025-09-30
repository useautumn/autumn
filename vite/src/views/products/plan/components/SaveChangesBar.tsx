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
	const { diff, setProduct } = useProductContext();
	const [saving, setSaving] = useState(false);
	const { product, setShowNewVersionDialog } = useProductContext();

	const { counts, isLoading } = useProductCountsQuery();
	const { refetch, product: queryOriginalProduct } = useProductQuery();

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
		const result = await updateProduct({
			axiosInstance,
			product,
			onSuccess: async () => {
				if (isOnboarding && setOnboardingOriginalProduct && product) {
					setOnboardingOriginalProduct(product as FrontendProduct);
				} else {
					await refetch();
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
