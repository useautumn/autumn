import type { ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export type DeletePlanScope = "latest" | "all";

const titleActionFor = ({
	archived,
	willArchive,
}: {
	archived: boolean;
	willArchive: boolean;
}) => {
	if (archived) return "Unarchive";
	if (willArchive) return "Archive";
	return "Delete";
};

const confirmErrorFallback = ({
	archived,
	willArchive,
}: {
	archived: boolean;
	willArchive: boolean;
}) => {
	if (archived) return "Error unarchiving plan";
	if (willArchive) return "Error archiving plan";
	return "Error deleting plan";
};

export const useDeletePlanDialog = ({
	product,
	open,
	dropdownOpen = false,
	onDeleteSuccess,
	setOpen,
}: {
	product: ProductV2;
	open: boolean;
	dropdownOpen?: boolean;
	onDeleteSuccess?: () => Promise<void>;
	setOpen: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { products } = useProductsQuery();
	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();
	const [scope, setScope] = useState<DeletePlanScope>("latest");

	const archived = product.archived ?? false;
	const latestVersion =
		products.find((candidate) => candidate.id === product.id)?.version ??
		product.version;
	const hasMultipleVersions = latestVersion > 1;
	const removeAllVersions = !hasMultipleVersions || scope === "all";

	const {
		data: preview,
		error: previewQueryError,
		isLoading,
		refetch: refetchPreview,
	} = useQuery({
		queryKey: buildKey([
			"catalogV2PlanDeletePreview",
			product.id,
			removeAllVersions ? "all" : product.version,
		]),
		queryFn: () =>
			CatalogV2Service.previewUpdate(axiosInstance, {
				remove_plans: removeAllVersions
					? [{ plan_id: product.id }]
					: [{ plan_id: product.id, version: product.version }],
			}),
		enabled: (open || dropdownOpen) && !archived,
	});

	const entry = preview?.plans.find(
		(candidate) => candidate.plan_id === product.id,
	);
	const willArchive = entry?.state.will_archive ?? false;
	const reasons = entry?.state.reasons ?? [];
	const previewError = previewQueryError
		? getBackendErr(previewQueryError, "Error loading plan delete preview")
		: null;
	const titleAction = titleActionFor({
		archived,
		willArchive,
	});

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) return;
		setScope("latest");
		void refetchPreview();
	};

	const handleConfirm = async () => {
		try {
			if (archived) {
				await updateCatalog({
					plans: [{ plan_id: product.id, archived: false }],
				});
				toast.success(`${product.name} unarchived successfully`);
			} else {
				await updateCatalog({
					remove_plans: removeAllVersions
						? [{ plan_id: product.id }]
						: [{ plan_id: product.id, version: product.version }],
				});
				if (willArchive) {
					toast.success(`${product.name} archived successfully`);
				} else {
					toast.success("Plan deleted successfully");
				}
			}
			setOpen(false);
			if (onDeleteSuccess) await onDeleteSuccess();
		} catch (error: unknown) {
			toast.error(
				getBackendErr(
					error as AxiosError,
					confirmErrorFallback({
						archived,
						willArchive,
					}),
				),
			);
		}
	};

	return {
		archived,
		hasMultipleVersions,
		isLoading,
		isPending,
		previewError,
		reasons,
		scope,
		setScope,
		titleAction,
		willArchive,
		handleConfirm,
		handleOpenChange,
	};
};
