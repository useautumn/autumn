import type { Feature } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

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
	const [loading, setLoading] = useState(false);

	const {
		data: deletionText,
		isLoading,
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
	}, [open, feature.id, refetchFeatureInfo]);

	const hasProducts = deletionText?.totalCount > 0;

	const getDeleteMessage = () => {
		if (feature.archived) {
			return "This feature is currently archived and hidden from the UI. Would you like to unarchive it to make it visible again?";
		}

		if (hasProducts) {
			if (deletionText?.productName && deletionText?.totalCount) {
				const totalCount = Number.parseInt(deletionText.totalCount);

				if (Number.isNaN(totalCount) || totalCount <= 0) {
					return "There are products using this feature. You must remove this feature from the products first, or archive it instead.";
				}
				if (totalCount === 1) {
					return `${deletionText.productName} is using this feature. You must remove this feature from the product first, or archive it instead.`;
				}
				const otherCount = totalCount - 1;
				return `${deletionText.productName} and ${otherCount} other product${otherCount > 1 ? "s" : ""} are using this feature. You must remove this feature from the products first, or archive it instead.`;
			}
			return "There are products using this feature. You must remove this feature from the products first, or archive it instead.";
		}
		return "Are you sure you want to delete this feature? This action cannot be undone.";
	};

	const handleDelete = async () => {
		setLoading(true);
		try {
			await FeatureService.deleteFeature(axiosInstance, feature.id);
			await refetch();
			toast.success("Feature deleted successfully");
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Error deleting feature"),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleArchive = async () => {
		setLoading(true);
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
		} catch (error: unknown) {
			toast.error(
				getBackendErr(
					error as AxiosError,
					`Error ${newArchivedState ? "archiving" : "unarchiving"} feature`,
				),
			);
		} finally {
			setLoading(false);
		}
	};

	if (isLoading) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle className="truncate max-w-[400px]">
						{feature.archived ? "Unarchive" : hasProducts ? "Archive" : "Delete"}{" "}
						{feature.name}
					</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words">
						{getDeleteMessage()
							.split("\n")
							.map((line, index) => (
								<span key={index}>
									{line}
									{index < getDeleteMessage().split("\n").length - 1 && <br />}
								</span>
							))}
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					{feature.archived && (
						<Button
							variant="primary"
							onClick={handleArchive}
							isLoading={loading}
						>
							Unarchive
						</Button>
					)}
					{hasProducts && !feature.archived && (
						<Button variant="primary" onClick={handleArchive} isLoading={loading}>
							Archive
						</Button>
					)}
					{!hasProducts && !feature.archived && (
						<Button
							variant="destructive"
							onClick={handleDelete}
							isLoading={loading}
						>
							Delete
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
