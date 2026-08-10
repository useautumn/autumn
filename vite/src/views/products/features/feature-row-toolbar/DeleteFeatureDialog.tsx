import type { Feature } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { featureToCatalogFeatureParams } from "../utils/buildFeatureMutationParams";

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
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();

	const {
		data: preview,
		isLoading,
		refetch: refetchPreview,
	} = useQuery({
		queryKey: buildKey(["catalogV2FeatureDeletePreview", feature.id]),
		queryFn: () =>
			CatalogV2Service.previewUpdate(axiosInstance, {
				remove_features: [{ feature_id: feature.id }],
			}),
		enabled: dropdownOpen || open,
	});

	const entry = preview?.features.find(
		(candidate) => candidate.feature_id === feature.id,
	);
	const willArchive = entry?.state.will_archive ?? false;
	const reasons = entry?.state.reasons ?? [];

	const reasonText = reasons.map((reason) => reason.message).join(" ");

	const handleConfirm = async () => {
		try {
			if (feature.archived) {
				await updateCatalog({
					features: [
						featureToCatalogFeatureParams({
							feature,
							archived: false,
						}),
					],
				});
				toast.success(`Feature ${feature.name} unarchived successfully`);
			} else {
				await updateCatalog({
					remove_features: [{ feature_id: feature.id }],
				});
				toast.success(
					willArchive
						? `Feature ${feature.name} archived successfully`
						: "Feature deleted successfully",
				);
			}
			setOpen(false);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(
					error as AxiosError,
					feature.archived
						? "Error unarchiving feature"
						: willArchive
							? "Error archiving feature"
							: "Error deleting feature",
				),
			);
		}
	};

	if (isLoading && !feature.archived) return null;

	const titleAction = feature.archived
		? "Unarchive"
		: willArchive
			? "Archive"
			: "Delete";

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (nextOpen) void refetchPreview();
			}}
		>
			<DialogContent
				className="bg-background"
				onClick={(e) => e.stopPropagation()}
			>
				<DialogHeader className="max-w-full">
					<DialogTitle className="truncate max-w-[400px]">
						{titleAction} {feature.name}
					</DialogTitle>
					<DialogDescription asChild>
						<div className="max-w-[400px] wrap-break-word space-y-2">
							{feature.archived ? (
								<p>
									This feature is currently archived. Would you like to
									unarchive it to make it visible again?
								</p>
							) : willArchive ? (
								<>
									<p>
										Cannot delete feature {feature.name}, archive it instead.
									</p>
									{reasonText ? (
										<p className="text-muted-foreground">{reasonText}</p>
									) : null}
								</>
							) : (
								<p>
									{reasonText ||
										"Are you sure you want to delete this feature? This action cannot be undone."}
								</p>
							)}
						</div>
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant={
							feature.archived || willArchive ? "primary" : "destructive"
						}
						onClick={handleConfirm}
						isLoading={isPending}
					>
						{titleAction}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
