import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
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

				{configQuery.isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-20" />
						<Skeleton className="h-16" />
					</div>
				) : configQuery.isError || !configQuery.data ? (
					<div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
						<p role="alert" className="text-pretty text-sm text-destructive">
							{getBackendErr(
								configQuery.error,
								"Failed to load lazy batch reset config",
							)}
						</p>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => configQuery.refetch()}
						>
							Retry
						</Button>
					</div>
				) : (
					<LazyBatchResetConfigForm
						key={`${configQuery.data.enabled}:${configQuery.data.lastSuccessAt ?? "never"}`}
						config={configQuery.data}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};
