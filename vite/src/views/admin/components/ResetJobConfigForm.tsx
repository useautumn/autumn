import { Badge, Button, DialogFooter, Switch } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	RESET_JOB_QUERY_KEY,
	type ResetJobConfig,
	type ResetJobFormValues,
} from "./resetJobConfigTypes";

const MAX_BATCH_SIZE = 2_000;

export const ResetJobConfigForm = ({
	config,
	onClose,
}: {
	config: ResetJobConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (nextConfig: ResetJobFormValues) => {
			await axiosInstance.put("/admin/reset-job-config", nextConfig);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: RESET_JOB_QUERY_KEY });
			toast.success("Reset Job config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save Reset Job config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			enabled: config.enabled,
			batchSize: config.batchSize as number | null,
		},
		onSubmit: async ({ value }) => {
			if (value.batchSize === null) return;
			await mutation.mutateAsync({
				enabled: value.enabled,
				batchSize: value.batchSize,
			});
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-4">
				<form.AppField name="enabled">
					{(field) => (
						<div className="flex items-center justify-between rounded-lg border border-border p-4">
							<div className="flex flex-col gap-0.5 pr-4">
								<div className="text-sm font-medium text-foreground">
									Reset Job enabled
								</div>
								<div className="text-pretty text-xs text-tertiary-foreground">
									When disabled, the legacy reset cron stops processing due
									balances.
								</div>
							</div>
							<Switch
								aria-label="Enable Reset Job"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.AppField>

				<form.AppField name="batchSize">
					{(field) => (
						<field.NumberField
							label="Batch size"
							description="Customer entitlements processed per reset batch."
							min={1}
							max={MAX_BATCH_SIZE}
							inputClassName="tabular-nums"
						/>
					)}
				</form.AppField>

				<div className="rounded-lg border border-border p-3 text-xs text-tertiary-foreground">
					<div className="mb-2 flex items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<div className="text-pretty">
						{config.configConfigured === false
							? "S3 Reset Job config is not configured. The job defaults to disabled."
							: config.error ||
								"Changes propagate to cron instances within 10 seconds."}
					</div>
				</div>
			</div>

			<DialogFooter className="flex-wrap">
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
