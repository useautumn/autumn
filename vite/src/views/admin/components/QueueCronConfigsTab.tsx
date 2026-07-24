import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@autumn/ui";
import { Clock, ListTodo, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import { JobQueuesDialog } from "./JobQueuesDialog";
import { LazyBatchResetConfigDialog } from "./LazyBatchResetConfigDialog";
import { QueueCronConfigRow } from "./QueueCronConfigRow";
import { ResetJobConfigDialog } from "./ResetJobConfigDialog";
import { ResetJobV2ConfigDialog } from "./ResetJobV2ConfigDialog";

type ConfigDialog =
	| "job-queues"
	| "batch-reset-v2"
	| "reset-job"
	| "lazy-batch-resets";

export const QueueCronConfigsTab = () => {
	const [activeDialog, setActiveDialog] = useState<ConfigDialog | null>(null);

	return (
		<>
			<Card className="gap-0 overflow-hidden py-0">
				<CardHeader className="border-b border-border bg-muted/20 py-4">
					<CardTitle className="text-balance text-base">
						Queue and cron controls
					</CardTitle>
					<CardDescription className="text-pretty">
						Tune worker consumption and balance reset pipelines without a
						deploy.
					</CardDescription>
				</CardHeader>
				<CardContent className="divide-y divide-border p-0">
					<QueueCronConfigRow
						icon={<ListTodo className="size-4" />}
						label="Worker infrastructure"
						title="Job Queues"
						description="Pause or resume worker consumption for shared and dedicated SQS queues."
						onEdit={() => setActiveDialog("job-queues")}
					/>
					<QueueCronConfigRow
						icon={<RefreshCw className="size-4" />}
						label="Primary reset cron"
						title="Batch Reset V2"
						description="Scan overdue customer entitlements and fan them out to reset workers."
						onEdit={() => setActiveDialog("batch-reset-v2")}
					/>
					<QueueCronConfigRow
						icon={<Clock className="size-4" />}
						label="Legacy reset cron"
						title="Reset Job"
						description="Continuously reset due balances in small, serialized batches."
						onEdit={() => setActiveDialog("reset-job")}
					/>
					<QueueCronConfigRow
						icon={<Sparkles className="size-4" />}
						label="Request-triggered repairs"
						title="Lazy Batch Resets"
						description="Control lazy entitlement repairs scheduled by customer and entity list requests."
						onEdit={() => setActiveDialog("lazy-batch-resets")}
					/>
				</CardContent>
			</Card>

			<JobQueuesDialog
				open={activeDialog === "job-queues"}
				onOpenChange={(open) => setActiveDialog(open ? "job-queues" : null)}
			/>
			<ResetJobV2ConfigDialog
				open={activeDialog === "batch-reset-v2"}
				onOpenChange={(open) => setActiveDialog(open ? "batch-reset-v2" : null)}
			/>
			<ResetJobConfigDialog
				open={activeDialog === "reset-job"}
				onOpenChange={(open) => setActiveDialog(open ? "reset-job" : null)}
			/>
			<LazyBatchResetConfigDialog
				open={activeDialog === "lazy-batch-resets"}
				onOpenChange={(open) =>
					setActiveDialog(open ? "lazy-batch-resets" : null)
				}
			/>
		</>
	);
};
