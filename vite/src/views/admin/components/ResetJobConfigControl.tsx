import { Button, Switch } from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export type ResetJobConfig = {
	enabled: boolean;
	batchSize: number;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const RESET_JOB_QUERY_KEY = ["admin-edge-config", "reset-job"] as const;

const MAX_BATCH_SIZE = 2_000;

const getSuccessMessage = ({
	nextConfig,
	currentBatchSize,
}: {
	nextConfig: Pick<ResetJobConfig, "enabled" | "batchSize">;
	currentBatchSize: number;
}) => {
	if (nextConfig.batchSize !== currentBatchSize) {
		return `Reset batch size set to ${nextConfig.batchSize.toLocaleString()}`;
	}
	return `Reset job ${nextConfig.enabled ? "enabled" : "disabled"}`;
};

const getStatusLabel = ({
	healthy,
	enabled,
}: {
	healthy: boolean;
	enabled: boolean;
}) => {
	if (!healthy) return "Config unavailable";
	return enabled ? "Enabled" : "Disabled";
};

export function ResetJobConfigControl({ config }: { config: ResetJobConfig }) {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (
			nextConfig: Pick<ResetJobConfig, "enabled" | "batchSize">,
		) => {
			await axiosInstance.put("/admin/reset-job-config", nextConfig);
		},
		onSuccess: async (_data, nextConfig) => {
			await queryClient.invalidateQueries({ queryKey: RESET_JOB_QUERY_KEY });
			toast.success(
				getSuccessMessage({
					nextConfig,
					currentBatchSize: config.batchSize,
				}),
			);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update reset job"));
		},
	});
	const form = useAppForm({
		defaultValues: { batchSize: config.batchSize as number | null },
		onSubmit: async ({ value }) => {
			if (value.batchSize === null) return;
			await mutation.mutateAsync({
				enabled: config.enabled,
				batchSize: value.batchSize,
			});
		},
	});
	const enabled = mutation.isPending
		? mutation.variables.enabled
		: config.enabled;

	return (
		<div className="flex items-end gap-3">
			<form.AppField name="batchSize">
				{(field) => (
					<field.NumberField
						label="Batch size"
						min={1}
						max={MAX_BATCH_SIZE}
						className="w-28"
						inputClassName="h-8 tabular-nums"
						hideFieldInfo
					/>
				)}
			</form.AppField>
			<form.Subscribe
				selector={(state) => ({
					batchSize: state.values.batchSize,
					isSubmitting: state.isSubmitting,
				})}
			>
				{({ batchSize, isSubmitting }) => (
					<>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => form.handleSubmit()}
							isLoading={isSubmitting}
							disabled={
								batchSize === null ||
								batchSize === config.batchSize ||
								mutation.isPending
							}
						>
							Apply
						</Button>
						<div className="flex h-8 items-center gap-2">
							<span className="text-xs text-tertiary-foreground">
								{getStatusLabel({
									healthy: config.configHealthy,
									enabled,
								})}
							</span>
							<Switch
								aria-label="Toggle reset job"
								checked={enabled}
								disabled={batchSize === null || mutation.isPending}
								onCheckedChange={(checked) =>
									mutation.mutate({
										enabled: checked,
										batchSize,
									})
								}
							/>
						</div>
					</>
				)}
			</form.Subscribe>
		</div>
	);
}
