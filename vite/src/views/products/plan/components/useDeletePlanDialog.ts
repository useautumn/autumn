import type { PreviewUpdateCatalogResponse, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductQuery } from "@/views/products/product/hooks/useProductQuery";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	canChooseDeleteScope,
	canDeleteThisVersion,
	type DeletePlanScope,
	hasMultiplePlanVersions,
	shouldRemoveThisVersion,
} from "./deletePlanScope";

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

const planPreviewEntry = ({
	preview,
	planId,
}: {
	preview: PreviewUpdateCatalogResponse | undefined;
	planId: string;
}) => preview?.plans.find((candidate) => candidate.plan_id === planId);

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
	const { numVersions } = useProductQuery();
	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();
	const [scope, setScope] = useState<DeletePlanScope>("version");

	const archived = product.archived ?? false;
	const previewEnabled = (open || dropdownOpen) && !archived;
	const listedVersion = products.find(
		(candidate) => candidate.id === product.id,
	)?.version;
	const hasMultipleVersions = hasMultiplePlanVersions({
		viewedVersion: product.version,
		listedVersion,
		numVersions,
	});

	const thisVersionQuery = useQuery({
		queryKey: buildKey([
			"catalogV2PlanDeletePreview",
			product.id,
			product.version,
		]),
		queryFn: () =>
			CatalogV2Service.previewUpdate(axiosInstance, {
				remove_plans: [{ plan_id: product.id, version: product.version }],
			}),
		enabled: previewEnabled,
	});

	const allVersionsQuery = useQuery({
		queryKey: buildKey(["catalogV2PlanDeletePreview", product.id, "all"]),
		queryFn: () =>
			CatalogV2Service.previewUpdate(axiosInstance, {
				remove_plans: [{ plan_id: product.id }],
			}),
		enabled: previewEnabled,
	});

	const thisVersionEntry = planPreviewEntry({
		preview: thisVersionQuery.data,
		planId: product.id,
	});
	const allVersionsEntry = planPreviewEntry({
		preview: allVersionsQuery.data,
		planId: product.id,
	});

	const thisVersionDeletable = canDeleteThisVersion({
		hasPreview: thisVersionEntry != null,
		previewFailed: Boolean(thisVersionQuery.error),
		willArchive: thisVersionEntry?.state.will_archive ?? true,
	});
	const willArchiveAll = allVersionsEntry?.state.will_archive ?? false;
	const canChooseScope = canChooseDeleteScope({
		thisVersionDeletable,
		hasMultipleVersions,
		willArchiveAll,
	});
	const removeThisVersion = shouldRemoveThisVersion({
		thisVersionDeletable,
		scope,
	});

	const entry = removeThisVersion ? thisVersionEntry : allVersionsEntry;
	const previewQueryError = removeThisVersion
		? thisVersionQuery.error
		: allVersionsQuery.error;
	const willArchive = entry?.state.will_archive ?? false;
	const reasons = entry?.state.reasons ?? [];
	const previewError = previewQueryError
		? getBackendErr(previewQueryError, "Error loading plan delete preview")
		: null;
	const titleAction = titleActionFor({
		archived,
		willArchive,
	});
	const isLoading = thisVersionQuery.isLoading || allVersionsQuery.isLoading;

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) return;
		setScope("version");
		void thisVersionQuery.refetch();
		void allVersionsQuery.refetch();
	};

	const handleConfirm = async () => {
		try {
			if (archived) {
				// Archiving fans out to every version, so unarchiving must match.
				await updateCatalog({
					plans: [
						{
							plan_id: product.id,
							archived: false,
							versioning: "all_versions",
						},
					],
				});
				toast.success(`${product.name} unarchived successfully`);
			} else {
				await updateCatalog({
					remove_plans: removeThisVersion
						? [{ plan_id: product.id, version: product.version }]
						: [{ plan_id: product.id }],
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
		canChooseScope,
		isLoading,
		isPending,
		previewError,
		reasons,
		removeThisVersion,
		scope,
		setScope,
		titleAction,
		willArchive,
		willArchiveAll,
		handleConfirm,
		handleOpenChange,
	};
};
