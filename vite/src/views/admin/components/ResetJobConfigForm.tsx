import { Badge, Button, DialogFooter, Separator, Switch } from "@autumn/ui";
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
			<div className="flex flex-col gap-6">
				<form.AppField name="enabled">
					{(field) => (
						<div className="flex items-center justify-between gap-6">
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium text-foreground">
									Reset Job enabled
								</div>
								<div className="text-pretty text-xs text-tertiary-foreground">
									When off, the legacy cron stops resetting due balances.
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
							description="Entitlements reset per batch."
							min={1}
							max={MAX_BATCH_SIZE}
							inputClassName="tabular-nums"
						/>
					)}
				</form.AppField>

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
							? "S3 config is missing, so the job defaults to off."
							: config.error ||
								"Changes reach cron instances within 10 seconds."}
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
