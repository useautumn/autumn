import type {
	FrontendProduct,
	UpdateCatalogPlanParamsInput,
} from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useFetchPreviewUpdateCatalog } from "@/hooks/queries/catalog/usePreviewUpdateCatalog";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { getBackendErr } from "@/utils/genUtils";
import {
	useProductQuery,
	useProductQueryState,
} from "../../product/hooks/useProductQuery";
import type { PlanChangeCreateConfirm } from "../versioning/PlanChangeDialog";

export const buildPromoteCatalogPlanParams = ({
	product,
}: {
	product: Pick<FrontendProduct, "id" | "version" | "version_slug">;
}): UpdateCatalogPlanParamsInput => {
	const versionSlug = product.version_slug;
	if (versionSlug) {
		return {
			plan_id: product.id,
			version_slug: versionSlug,
			active: true,
		};
	}

	return {
		plan_id: product.id,
		version: product.version,
		active: true,
	};
};

export const usePromotePlanVersion = () => {
	const product = useProductStore((s) => s.product);
	const isCusPlanEditor = useIsCusPlanEditor();
	const fetchPreviewUpdateCatalog = useFetchPreviewUpdateCatalog();
	const { setQueryStates } = useProductQueryState();
	const { invalidate: invalidateProduct } = useProductQuery();
	const { invalidate: invalidateProducts } = useProductsQuery();
	const [confirm, setConfirm] = useState<PlanChangeCreateConfirm | null>(null);

	const isAlreadyActive = Boolean(product.active);
	const canPromote = !isAlreadyActive && !isCusPlanEditor;

	const afterPromoted = async () => {
		await setQueryStates({ version: null });
		await Promise.all([invalidateProduct(), invalidateProducts()]);
	};

	const previewPromote = useMutation({
		mutationFn: async () => {
			const plans = [buildPromoteCatalogPlanParams({ product })];
			const preview = await fetchPreviewUpdateCatalog({ plans });
			return { plans, preview };
		},
		onSuccess: ({ plans, preview }) => {
			const planPreview = preview.plans[0];
			if (!planPreview?.promotion_details) {
				toast.error("This version is already the active plan");
				return;
			}

			setConfirm({
				preview: planPreview,
				plans,
				title: "Promote to active",
				successText: "Version promoted",
				errorText: "Failed to promote version",
				confirmLabel: "Promote to active",
				onSaved: afterPromoted,
			});
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to preview promotion"));
		},
	});

	return {
		canPromote,
		isPreviewing: previewPromote.isPending,
		confirm,
		setConfirm,
		startPromote: () => {
			if (!canPromote) return;
			previewPromote.mutate();
		},
	};
};
