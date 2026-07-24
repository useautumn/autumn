import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { ResetJobConfigForm } from "./ResetJobConfigForm";
import {
	RESET_JOB_QUERY_KEY,
	type ResetJobConfig,
} from "./resetJobConfigTypes";

export const ResetJobConfigDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<ResetJobConfig>({
		queryKey: RESET_JOB_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/reset-job-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Reset Job</DialogTitle>
					<DialogDescription className="text-pretty">
						Control the legacy serialized balance reset cron.
					</DialogDescription>
				</DialogHeader>

				{configQuery.isLoading ? (
					<div className="flex flex-col gap-3">
						<Skeleton className="h-20" />
						<Skeleton className="h-16" />
					</div>
				) : configQuery.isError || !configQuery.data ? (
					<>
						<p role="alert" className="text-pretty text-sm text-destructive">
							{getBackendErr(
								configQuery.error,
								"Failed to load Reset Job config",
							)}
						</p>
						<DialogFooter>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => configQuery.refetch()}
							>
								Retry
							</Button>
						</DialogFooter>
					</>
				) : (
					<ResetJobConfigForm
						key={`${configQuery.data.enabled}:${configQuery.data.batchSize}`}
						config={configQuery.data}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
};
