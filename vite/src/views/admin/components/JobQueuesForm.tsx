import { Badge, Button, DialogFooter, Separator, Switch } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	JOB_QUEUE_QUERY_KEY,
	type JobQueueConfig,
} from "./jobQueueConfigTypes";

export const JobQueuesForm = ({
	config,
	onClose,
}: {
	config: JobQueueConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (enabledByQueue: Record<string, boolean>) => {
			await axiosInstance.put("/admin/job-queue-config", {
				queues: Object.fromEntries(
					Object.entries(enabledByQueue).map(([queueId, enabled]) => [
						queueId,
						{ enabled },
					]),
				),
			});
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: JOB_QUEUE_QUERY_KEY });
			toast.success("Job queue config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save job queue config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			enabledByQueue: Object.fromEntries(
				config.knownQueues.map((queue) => [
					queue.id,
					config.queues[queue.id]?.enabled ?? queue.defaultEnabled,
				]),
			) as Record<string, boolean>,
		},
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value.enabledByQueue);
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const enabledByQueue = useStore(
		form.store,
		(state) => state.values.enabledByQueue,
	);
	const pausedCount = config.knownQueues.filter(
		(queue) => !enabledByQueue[queue.id],
	).length;

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-5">
					{config.knownQueues.map((queue) => (
						<form.AppField
							key={queue.id}
							name={`enabledByQueue.${queue.id}` as const}
						>
							{(field) => (
								<div className="flex items-center justify-between gap-6">
									<div className="flex flex-col gap-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="text-sm font-medium text-foreground">
												{queue.label}
											</span>
											{!queue.defaultEnabled && (
												<Badge variant="muted">Off by default</Badge>
											)}
										</div>
										<div className="text-pretty text-xs text-tertiary-foreground">
											{queue.description}
										</div>
									</div>
									<Switch
										aria-label={`Poll ${queue.label}`}
										checked={field.state.value === true}
										onCheckedChange={field.handleChange}
									/>
								</div>
							)}
						</form.AppField>
					))}
				</div>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						{pausedCount > 0 && (
							<Badge variant="muted">{pausedCount} paused</Badge>
						)}
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<p className="text-pretty">
						{config.configConfigured === false
							? "S3 config is missing, so every queue falls back to its default."
							: config.error ||
								"Changes reach workers within about 10 seconds."}
					</p>
				</div>
			</div>

			<DialogFooter className="flex-wrap pt-2">
				{mutation.error && (
					<span role="alert" className="mr-auto text-xs text-destructive">
						{getBackendErr(mutation.error, "Failed to save config")}
					</span>
				)}
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={mutation.isPending}
					disabled={!isDirty || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
