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

	const p = preview?.products;
	const f = preview?.features;
	const hasChangesToSync = (p?.new?.length ?? 0) > 0 || (p?.updated?.length ?? 0) > 0 || (f?.new?.length ?? 0) > 0;

	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader className="max-w-full">
					<DialogTitle>Sync to {targetEnvName}</DialogTitle>
					<DialogDescription className="max-w-[400px] break-words flex flex-col gap-3">
						{!previewLoading && (
							<>
								<p>
									{hasChangesToSync
										? [
											p?.new?.length && `${p.new.length} new product${p.new.length > 1 ? "s" : ""}`,
											p?.updated?.length && `${p.updated.length} updated`,
											f?.new?.length && `${f.new.length} new feature${f.new.length > 1 ? "s" : ""}`,
											p?.unchanged?.length && `${p.unchanged.length} in sync`,
										]
											.filter(Boolean)
											.join(", ")
										: "Everything is already in sync."}
								</p>
								{preview?.products?.targetOnly?.length > 0 && (
									<WarningBox>
										{preview.products.targetOnly.map((p) => p.name).join(", ")} is in{" "}
										{targetEnvName} but not {sourceEnvName}, you can archive it.
									</WarningBox>
								)}
								{preview?.defaultConflict && (
									<WarningBox>
										Default product conflict: "{preview.defaultConflict.source}"
										({sourceEnvName}) vs "{preview.defaultConflict.target}" (
										{targetEnvName}).
									</WarningBox>
								)}
								{preview?.customersAffected?.length > 0 && (
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
								{hasChangesToSync && (
									<p>
										Type{" "}
										<code className="font-mono font-semibold">{confirmWord}</code>{" "}
										to continue.
									</p>
								)}
							</>
						)}
					</DialogDescription>
				</DialogHeader>

				{hasChangesToSync && (
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
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSync}
						isLoading={isLoading}
						disabled={previewLoading || !hasChangesToSync || confirmText !== confirmWord}
					>
						Sync to {targetEnvName}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
