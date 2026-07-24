import { Badge, Button, DialogFooter, Separator, Switch } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	RESET_JOB_V2_QUERY_KEY,
	type ResetJobV2Config,
	type ResetJobV2FormValues,
} from "./resetJobV2ConfigTypes";

export const ResetJobV2ConfigForm = ({
	config,
	onClose,
}: {
	config: ResetJobV2Config;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (nextConfig: ResetJobV2FormValues) => {
			await axiosInstance.put("/admin/reset-job-v2-config", nextConfig);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: RESET_JOB_V2_QUERY_KEY,
			});
			toast.success("Batch Reset V2 config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save Batch Reset V2 config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			enabled: config.enabled,
			scanBatchSize: config.scanBatchSize as number | null,
			workerBatchSize: config.workerBatchSize as number | null,
			maxConcurrentJobs: config.maxConcurrentJobs as number | null,
			scanIntervalMs: config.scanIntervalMs as number | null,
			queueHighWaterMessages: config.queueHighWaterMessages as number | null,
			queueDepthPollMs: config.queueDepthPollMs as number | null,
		},
		onSubmit: async ({ value }) => {
			if (
				value.scanBatchSize === null ||
				value.workerBatchSize === null ||
				value.maxConcurrentJobs === null ||
				value.scanIntervalMs === null ||
				value.queueHighWaterMessages === null ||
				value.queueDepthPollMs === null
			) {
				return;
			}

			await mutation.mutateAsync({
				enabled: value.enabled,
				scanBatchSize: value.scanBatchSize,
				workerBatchSize: value.workerBatchSize,
				maxConcurrentJobs: value.maxConcurrentJobs,
				scanIntervalMs: value.scanIntervalMs,
				queueHighWaterMessages: value.queueHighWaterMessages,
				queueDepthPollMs: value.queueDepthPollMs,
			});
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-6">
				<form.AppField name="enabled">
					{(field) => (
						<div className="flex items-center justify-between gap-6">
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium text-foreground">
									Batch Reset V2 enabled
								</div>
								<div className="text-pretty text-xs text-tertiary-foreground">
									When disabled, the cron stops scanning and enqueueing new
									reset work.
								</div>
							</div>
							<Switch
								aria-label="Enable Batch Reset V2"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.AppField>

				<div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
					<form.AppField name="maxConcurrentJobs">
						{(field) => (
							<field.NumberField
								label="Concurrent reset jobs"
								description="Maximum processed at once across all workers."
								min={config.limits.maxConcurrentJobs.min}
								max={config.limits.maxConcurrentJobs.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="scanBatchSize">
						{(field) => (
							<field.NumberField
								label="Scan batch size"
								description="Entitlements fetched per scan."
								min={config.limits.scanBatchSize.min}
								max={config.limits.scanBatchSize.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="workerBatchSize">
						{(field) => (
							<field.NumberField
								label="Worker batch size"
								description="IDs sent in each worker message."
								min={config.limits.workerBatchSize.min}
								max={config.limits.workerBatchSize.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="scanIntervalMs">
						{(field) => (
							<field.NumberField
								label="Scan interval (ms)"
								description="Delay between full scan pages."
								min={config.limits.scanIntervalMs.min}
								max={config.limits.scanIntervalMs.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="queueHighWaterMessages">
						{(field) => (
							<field.NumberField
								label="Queue high water (messages)"
								description="Scanning pauses while the reset queue holds more than this."
								min={config.limits.queueHighWaterMessages.min}
								max={config.limits.queueHighWaterMessages.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="queueDepthPollMs">
						{(field) => (
							<field.NumberField
								label="Queue depth poll (ms)"
								description="How often the scan gates re-check queue depth."
								min={config.limits.queueDepthPollMs.min}
								max={config.limits.queueDepthPollMs.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
				</div>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<p className="text-pretty">
						{config.configConfigured === false
							? "S3 Batch Reset V2 config is not configured. The job defaults to disabled."
							: config.error ||
								"Changes propagate to cron and worker instances within 10 seconds."}
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
