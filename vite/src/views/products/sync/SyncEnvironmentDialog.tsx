import { AppEnv } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { WarningBox } from "@/components/general/modal-components/WarningBox";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useSyncPreview } from "./useSyncPreview";

type SyncEnvironmentDialogProps = {
	open: boolean;
	setOpen: (open: boolean) => void;
	from: AppEnv;
	to: AppEnv;
};

export const SyncEnvironmentDialog = (props: SyncEnvironmentDialogProps) => {
	const axiosInstance = useAxiosInstance();
	const [isLoading, setIsLoading] = useState(false);
	const { data: preview, isLoading: previewLoading } = useSyncPreview({
		enabled: props.open,
	});

	const targetEnvName = props.to === AppEnv.Live ? "Production" : "Sandbox";
	const sourceEnvName = props.from === AppEnv.Live ? "Production" : "Sandbox";

	const handleSync = async () => {
		setIsLoading(true);
		try {
			await axiosInstance.post("/products/copy_to_production");
			toast.success(`Successfully synced to ${targetEnvName}`);
			props.setOpen(false);
		} catch (error) {
			toast.error("Failed to sync environments");
			console.error("Sync error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleOpenChange = (newOpen: boolean) => {
		if (!isLoading) {
			props.setOpen(newOpen);
		}
	};

	const hasWarnings =
		(preview?.products?.targetOnly?.length ?? 0) > 0 ||
		preview?.defaultConflict ||
		(preview?.customersAffected?.length ?? 0) > 0;

	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle>Sync to {targetEnvName}</DialogTitle>
					<DialogDescription
						className={
							hasWarnings
								? "max-w-[400px] break-words flex flex-col gap-3"
								: undefined
						}
					>
						<p>
							Sync all products and features from {sourceEnvName} to{" "}
							{targetEnvName}? Matching products will be updated.
						</p>
						{!previewLoading && preview?.products?.targetOnly?.length > 0 && (
							<WarningBox>
								{preview.products.targetOnly.map((p) => p.name).join(", ")}{" "}
								{preview.products.targetOnly.length === 1 ? "is" : "are"} in{" "}
								{targetEnvName} but not {sourceEnvName}. You can archive{" "}
								{preview.products.targetOnly.length === 1 ? "it" : "them"} after
								syncing.
							</WarningBox>
						)}
						{!previewLoading && preview?.defaultConflict && (
							<WarningBox>
								Default product conflict: {sourceEnvName} has "
								{preview.defaultConflict.source}" as default, but {targetEnvName}{" "}
								has "{preview.defaultConflict.target}".
							</WarningBox>
						)}
						{!previewLoading && preview?.customersAffected?.length > 0 && (
							<WarningBox>
								{preview.customersAffected.map((p) => (
									<span key={p.productId}>
										{p.customerCount} customer
										{p.customerCount === 1 ? "" : "s"} on {p.productName} will
										remain on their current version until migrated.
									</span>
								))}
							</WarningBox>
						)}
					</DialogDescription>
				</DialogHeader>

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => props.setOpen(false)}
						disabled={isLoading}
					>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSync}
						isLoading={isLoading}
						disabled={previewLoading}
					>
						Sync to {targetEnvName}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
