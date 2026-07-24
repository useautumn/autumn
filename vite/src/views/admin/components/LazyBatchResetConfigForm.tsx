import {
	Alert,
	AlertDescription,
	Badge,
	Button,
	DialogFooter,
	Switch,
} from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	LAZY_BATCH_RESET_QUERY_KEY,
	type LazyBatchResetConfig,
} from "./lazyBatchResetConfigTypes";

export const LazyBatchResetConfigForm = ({
	config,
	onClose,
}: {
	config: LazyBatchResetConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (enabled: boolean) => {
			await axiosInstance.put("/admin/batch-reset-config", { enabled });
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: LAZY_BATCH_RESET_QUERY_KEY,
			});
			toast.success("Lazy batch reset config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(
				getBackendErr(error, "Failed to save lazy batch reset config"),
			);
		},
	});
	const form = useAppForm({
		defaultValues: { enabled: config.enabled },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value.enabled);
		},
	});
	const enabled = useStore(form.store, (state) => state.values.enabled);
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-between rounded-lg border border-border p-4">
					<div className="flex flex-col gap-0.5 pr-4">
						<div className="text-sm font-medium text-foreground">
							Lazy batch resets enabled
						</div>
						<div className="text-pretty text-xs text-tertiary-foreground">
							When disabled, producers stop enqueueing lazy entitlement repairs
							and workers skip queued jobs.
						</div>
					</div>
					<form.AppField name="enabled">
						{(field) => (
							<Switch
								aria-label="Enable lazy batch entitlement resets"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						)}
					</form.AppField>
				</div>

				{!enabled && (
					<Alert>
						<AlertDescription className="text-pretty">
							Customer and entity list requests will stop scheduling background
							entitlement repairs. Already queued jobs will be acknowledged
							without running.
						</AlertDescription>
					</Alert>
				)}

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
							? "S3 lazy batch reset config is not configured. Lazy resets default to enabled."
							: config.error ||
								"Changes propagate to servers and workers within 10 seconds."}
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
