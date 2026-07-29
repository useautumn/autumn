import { useState } from "react";
import { EdgeConfigCard } from "./EdgeConfigCard";
import { QUEUE_CRON_CARDS, type QueueCronCardId } from "./edgeConfigCards";
import { JobQueuesDialog } from "./JobQueuesDialog";
import { LazyBatchResetConfigDialog } from "./LazyBatchResetConfigDialog";
import { ResetJobConfigDialog } from "./ResetJobConfigDialog";
import { ResetJobV2ConfigDialog } from "./ResetJobV2ConfigDialog";

export const QueueCronConfigsTab = () => {
	const [openConfig, setOpenConfig] = useState<QueueCronCardId | null>(null);

	const closeDialog = (open: boolean) => {
		if (!open) setOpenConfig(null);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-0.5">
				<h3 className="text-sm font-medium text-foreground">
					Queue and cron controls
				</h3>
				<p className="text-pretty text-xs text-tertiary-foreground">
					Tune worker consumption and balance reset pipelines without a deploy.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{QUEUE_CRON_CARDS.map((card) => (
					<EdgeConfigCard
						key={card.id}
						def={card}
						onEdit={() => setOpenConfig(card.id)}
					/>
				))}
			</div>

			<JobQueuesDialog
				open={openConfig === "job-queues"}
				onOpenChange={closeDialog}
			/>

			<ResetJobV2ConfigDialog
				open={openConfig === "batch-reset-v2"}
				onOpenChange={closeDialog}
			/>

			<ResetJobConfigDialog
				open={openConfig === "reset-job"}
				onOpenChange={closeDialog}
			/>

			<LazyBatchResetConfigDialog
				open={openConfig === "lazy-batch-resets"}
				onOpenChange={closeDialog}
			/>
		</div>
	);
};
