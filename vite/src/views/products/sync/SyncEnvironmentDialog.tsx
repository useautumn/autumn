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
import { Input } from "@/components/v2/inputs/Input";
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
	const [confirmText, setConfirmText] = useState("");
	const { data: preview, isLoading: previewLoading } = useSyncPreview({
		enabled: props.open,
	});

	const targetEnvName = props.to === AppEnv.Live ? "Production" : "Sandbox";
	const sourceEnvName = props.from === AppEnv.Live ? "Production" : "Sandbox";
	const confirmWord = targetEnvName.toLowerCase();

	const handleSync = async () => {
		if (confirmText !== confirmWord) {
			toast.error("Confirmation text is incorrect");
			return;
		}

		setIsLoading(true);
		try {
			await axiosInstance.post("/products/copy_to_production");
			toast.success(`Successfully synced to ${targetEnvName}`);
			props.setOpen(false);
			setConfirmText("");
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
			if (!newOpen) {
				setConfirmText("");
			}
		}
	};

	const hasProductsToSync = (preview?.products?.toSync?.length ?? 0) > 0;

	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle>Sync to {targetEnvName}</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words flex flex-col gap-3">
						{!previewLoading && !hasProductsToSync ? (
							<p>
								No new products to sync from {sourceEnvName} to {targetEnvName}.
							</p>
						) : (
							<>
								<p>
									Sync all products and features from {sourceEnvName} to{" "}
									{targetEnvName}?
								</p>
								{!previewLoading &&
									preview?.products?.targetOnly?.length > 0 && (
										<WarningBox>
											Product {preview.products.targetOnly.map((p) => p.name).join(", ")}{" "}
											only exists in {targetEnvName} and will remain unchanged.
										</WarningBox>
									)}
								{!previewLoading && preview?.defaultConflict && (
									<WarningBox>
										Default product conflict: "{preview.defaultConflict.source}"
										({sourceEnvName}) vs "{preview.defaultConflict.target}" (
										{targetEnvName}).
									</WarningBox>
								)}
								{!previewLoading && preview?.customersAffected?.length > 0 && (
									<WarningBox>
										{preview.customersAffected.map((p) => (
											<span key={p.productId}>
												{p.customerCount} customer
												{p.customerCount === 1 ? "" : "s"} on {p.productName}{" "}
												will remain until migrated.
											</span>
										))}
									</WarningBox>
								)}
								<p>
									Type{" "}
									<code className="font-mono font-semibold">{confirmWord}</code>{" "}
									to continue.
								</p>
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{hasProductsToSync && (
					<Input
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
						placeholder={confirmWord}
						className="w-full"
					/>
				)}

				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => props.setOpen(false)}
						disabled={isLoading}
					>
						{hasProductsToSync ? "Cancel" : "Close"}
					</Button>
					{hasProductsToSync && (
						<Button
							variant="primary"
							onClick={handleSync}
							isLoading={isLoading}
							disabled={previewLoading || confirmText !== confirmWord}
						>
							Sync to {targetEnvName}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
