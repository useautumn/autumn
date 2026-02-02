import type { AgentPricingConfig, UpdateProductV2Params } from "@autumn/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, pushPage } from "@/utils/genUtils";
import {
	getChangedProductIds,
	getVersionedProductIds,
} from "@/views/onboarding4/preview/previewTypes";
import { updateProduct } from "@/views/products/product/utils/updateProduct";

export const usePricingConfigSave = ({
	initialConfig,
}: {
	initialConfig: AgentPricingConfig | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const { org, mutate: mutateOrg } = useOrg();
	const {
		counts,
		isCountsLoading,
		refetch: refetchProducts,
	} = useProductsQuery();

	const [isSaving, setIsSaving] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [versionedProductIds, setVersionedProductIds] = useState<string[]>([]);
	const [pendingConfig, setPendingConfig] = useState<AgentPricingConfig | null>(
		null,
	);

	const executeSave = async ({ config }: { config: AgentPricingConfig }) => {
		// Push new products/features (existing are skipped server-side)
		await axiosInstance.post("/v1/configs/push", {
			features: config.features,
			products: config.products,
		});

		const changedIds = getChangedProductIds({
			initialConfig,
			currentConfig: config,
		});
		const existingIds = new Set(initialConfig?.products.map((p) => p.id) ?? []);

		for (const productId of changedIds) {
			if (!existingIds.has(productId)) continue;
			const agentProduct = config.products.find((p) => p.id === productId);
			if (!agentProduct) continue;

			await updateProduct({
				axiosInstance,
				productId,
				product: {
					id: agentProduct.id,
					name: agentProduct.name,
					is_add_on: agentProduct.is_add_on,
					is_default: agentProduct.is_default,
					group: agentProduct.group || null, // empty string → null
					items: agentProduct.items ?? [],
					free_trial: agentProduct.free_trial ?? null,
				} satisfies UpdateProductV2Params,
				onSuccess: async () => {},
			});
		}
	};

	const handleSave = async ({
		config,
	}: {
		config: AgentPricingConfig | null;
	}) => {
		if (!config) return;
		if (isCountsLoading) {
			toast.error("Plan counts are loading");
			return;
		}

		setIsSaving(true);
		try {
			const versionedIds = getVersionedProductIds({
				initialConfig,
				currentConfig: config,
				productCounts: counts,
			});

			if (versionedIds.length > 0) {
				setVersionedProductIds(versionedIds);
				setPendingConfig(config);
				setConfirmOpen(true);
				return;
			}

			await executeSave({ config });
			toast.success("Changes saved successfully");
			await refetchProducts();

			if (!org?.onboarded) {
				await axiosInstance.patch("/v1/organization", { onboarded: true });
				await mutateOrg();
			}

			pushPage({ path: "/products", navigate });
		} catch (error) {
			console.error("Error saving changes:", error);
			toast.error(getBackendErr(error, "Failed to save changes"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleConfirmSave = async () => {
		if (!pendingConfig) return;
		setIsSaving(true);
		try {
			await executeSave({ config: pendingConfig });
			toast.success("Changes saved successfully");
			await refetchProducts();

			if (!org?.onboarded) {
				await axiosInstance.patch("/v1/organization", { onboarded: true });
				await mutateOrg();
			}

			pushPage({ path: "/products", navigate });
			setConfirmOpen(false);
			setPendingConfig(null);
		} catch (error) {
			console.error("Error saving changes:", error);
			toast.error(getBackendErr(error, "Failed to save changes"));
		} finally {
			setIsSaving(false);
		}
	};

	return {
		isSaving,
		confirmOpen,
		setConfirmOpen,
		versionedProductIds,
		handleSave,
		handleConfirmSave,
	};
};
