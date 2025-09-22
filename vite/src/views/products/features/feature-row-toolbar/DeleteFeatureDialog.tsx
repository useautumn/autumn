import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { Feature } from "@autumn/shared";
import { useState, useEffect } from "react";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { toast } from "sonner";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";

export const DeleteFeatureDialog = ({
	feature,
	open,
	setOpen,
	dropdownOpen,
}: {
	feature: Feature;
	open: boolean;
	setOpen: (open: boolean) => void;
	dropdownOpen: boolean;
}) => {
	const { refetch } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [archiveLoading, setArchiveLoading] = useState(false);

	const {
		data: deletionText,
		isLoading: isFeatureInfoLoading,
		refetch: refetchFeatureInfo,
	} = useGeneralQuery({
		url: `/features/data/deletion_text/${feature.id}`,
		queryKey: ["featureInfo", feature.id],
		enabled: dropdownOpen,
	});

	useEffect(() => {
		if (open) {
			refetchFeatureInfo();
		}
	}, [open, feature.id]);

	const hasProducts = deletionText?.totalCount > 0;

	const getDeleteMessage = () => {
		if (feature.archived) {
			return "This feature is currently archived and hidden from the UI. Would you like to unarchive it to make it visible again?";
		}

		if (hasProducts) {
			if (deletionText?.productName && deletionText?.totalCount) {
				if (deletionText.totalCount === 1) {
					return `${deletionText.productName} is using this feature. You must remove this feature from the product first, or archive it instead.`;
				} else {
					const otherCount = deletionText.totalCount - 1;
					return `${deletionText.productName} and ${otherCount} other product${otherCount > 1 ? "s" : ""} are using this feature. You must remove this feature from the products first, or archive it instead.`;
				}
			} else {
				return "There are products using this feature. You must remove this feature from the products first, or archive it instead.";
			}
		} else {
			return "Are you sure you want to delete this feature? This action cannot be undone.";
		}
	};

	const handleDelete = async () => {
		if (archiveLoading) return;
		setDeleteLoading(true);
		try {
			await FeatureService.deleteFeature(axiosInstance, feature.id);
			await refetch();
			setOpen(false);
		} catch (error) {
			console.error("Error deleting feature:", error);
			toast.error(getBackendErr(error, "Error deleting feature"));
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleArchive = async () => {
		setArchiveLoading(true);
		const newArchivedState = !feature.archived;
		try {
			await FeatureService.updateFeature(axiosInstance, feature.id, {
				archived: newArchivedState,
			});
			await refetch();
			toast.success(
				`Feature ${feature.name} ${newArchivedState ? "archived" : "unarchived"} successfully`,
			);
			setOpen(false);
		} catch (error) {
			console.error(
				`Error ${newArchivedState ? "archiving" : "unarchiving"} feature:`,
				error,
			);
			toast.error(
				getBackendErr(
					error,
					`Error ${newArchivedState ? "archiving" : "unarchiving"} feature`,
				),
			);
		} finally {
			setArchiveLoading(false);
		}
	};

	if (isFeatureInfoLoading) return <></>;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="w-md" onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle>
						{feature.archived ? "Unarchive" : "Delete"} {feature.name}
					</DialogTitle>
				</DialogHeader>

				<div className="flex text-t2 text-sm">
					<p>{getDeleteMessage()}</p>
				</div>
				<DialogFooter>
					{hasProducts && !feature.archived && (
						<Button
							variant="outline"
							onClick={handleArchive}
							isLoading={archiveLoading}
						>
							{feature.archived ? "Unarchive" : "Archive"}
						</Button>
					)}
					{feature.archived && (
						<Button
							variant="outline"
							onClick={handleArchive}
							isLoading={archiveLoading}
						>
							{"Unarchive"}
						</Button>
					)}
					{!hasProducts && !feature.archived && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							isLoading={deleteLoading}
						>
							Confirm
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
