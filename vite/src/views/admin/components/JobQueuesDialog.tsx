import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { JobQueuesForm } from "./JobQueuesForm";
import {
	JOB_QUEUE_QUERY_KEY,
	type JobQueueConfig,
} from "./jobQueueConfigTypes";

export const JobQueuesDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<JobQueueConfig>({
		queryKey: JOB_QUEUE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/job-queue-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Job Queues</DialogTitle>
					<DialogDescription className="text-pretty">
						Turn a queue off to stop workers polling it. Producers keep sending,
						so messages pile up and run once you turn it back on.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load job queue config"
					skeleton={
						<div className="flex flex-col gap-3">
							<Skeleton className="h-12" />
							<Skeleton className="h-12" />
							<Skeleton className="h-12" />
							<Skeleton className="h-16" />
						</div>
					}
				>
					{(config) => (
						<JobQueuesForm
							key={config.knownQueues
								.map(
									(queue) =>
										`${queue.id}:${config.queues[queue.id]?.enabled ?? queue.defaultEnabled}`,
								)
								.join("|")}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
};
