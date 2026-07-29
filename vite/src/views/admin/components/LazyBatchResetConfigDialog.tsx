import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { LazyBatchResetConfigForm } from "./LazyBatchResetConfigForm";
import {
	LAZY_BATCH_RESET_QUERY_KEY,
	type LazyBatchResetConfig,
} from "./lazyBatchResetConfigTypes";

export const LazyBatchResetConfigDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<LazyBatchResetConfig>({
		queryKey: LAZY_BATCH_RESET_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/batch-reset-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Lazy Batch Resets</DialogTitle>
					<DialogDescription className="text-pretty">
						Control request-triggered background entitlement repairs.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load lazy batch reset config"
				>
					{(config) => (
						<LazyBatchResetConfigForm
							key={`${config.enabled}:${config.lastSuccessAt ?? "never"}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
};
