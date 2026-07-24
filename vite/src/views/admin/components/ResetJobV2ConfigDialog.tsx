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
import { ResetJobV2ConfigForm } from "./ResetJobV2ConfigForm";
import {
	RESET_JOB_V2_QUERY_KEY,
	type ResetJobV2Config,
} from "./resetJobV2ConfigTypes";

export const ResetJobV2ConfigDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<ResetJobV2Config>({
		queryKey: RESET_JOB_V2_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/reset-job-v2-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Batch Reset V2</DialogTitle>
					<DialogDescription className="text-pretty">
						Control reset scanning, worker fan-out, and runtime throughput.
					</DialogDescription>
				</DialogHeader>

				{configQuery.isLoading ? (
					<div className="grid gap-4 md:grid-cols-2">
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
						<Skeleton className="h-20" />
					</div>
				) : configQuery.isError || !configQuery.data ? (
					<div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
						<p role="alert" className="text-pretty text-sm text-destructive">
							{getBackendErr(
								configQuery.error,
								"Failed to load Batch Reset V2 config",
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
					<ResetJobV2ConfigForm
						key={`${configQuery.data.enabled}:${configQuery.data.scanBatchSize}:${configQuery.data.workerBatchSize}:${configQuery.data.maxConcurrentJobs}:${configQuery.data.scanIntervalMs}`}
						config={configQuery.data}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};
