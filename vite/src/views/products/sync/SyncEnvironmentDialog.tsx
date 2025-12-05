import { AppEnv } from "@autumn/shared";
import { useState } from "react";
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
import { useAxiosInstance } from "@/services/useAxiosInstance";

type SyncEnvironmentDialogProps = {
	open: boolean;
	setOpen: (open: boolean) => void;
	from: AppEnv;
	to: AppEnv;
};

export const SyncEnvironmentDialog = (props: SyncEnvironmentDialogProps) => {
	const axiosInstance = useAxiosInstance();
	const [isLoading, setIsLoading] = useState(false);

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

	return (
		<Dialog open={props.open} onOpenChange={handleOpenChange}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader className="max-w-full">
					<DialogTitle>Sync to {targetEnvName}</DialogTitle>
					<DialogDescription>
						Sync all products and features from {sourceEnvName} to{" "}
						{targetEnvName}? Matching products will be updated.
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
					>
						Sync to {targetEnvName}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
