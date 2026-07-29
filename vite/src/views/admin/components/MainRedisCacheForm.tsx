import {
	Alert,
	AlertDescription,
	AlertTitle,
	Badge,
	Button,
	DialogFooter,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	MAIN_REDIS_CACHE_QUERY_KEY,
	MAIN_REDIS_INSTANCE_OPTIONS,
	type MainRedisCacheConfig,
	type MainRedisInstanceName,
} from "./mainRedisCacheConfigTypes";

export const MainRedisCacheForm = ({
	config,
	onClose,
}: {
	config: MainRedisCacheConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (activeInstance: MainRedisInstanceName) => {
			await axiosInstance.put("/admin/main-redis-cache-config", {
				activeInstance,
			});
		},
		onSuccess: async (_data, activeInstance) => {
			await queryClient.invalidateQueries({
				queryKey: MAIN_REDIS_CACHE_QUERY_KEY,
			});
			toast.success(`Active main Redis set to "${activeInstance}"`);
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to switch main Redis"));
		},
	});
	const form = useAppForm({
		defaultValues: { activeInstance: config.activeInstance },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value.activeInstance);
		},
	});

	const fallbackUnavailable =
		!config.fallbackConfigured || config.fallbackStatus !== "ready";

	return (
		<>
			<div className="flex flex-col gap-6">
				<form.Field name="activeInstance">
					{(field) => (
						<div className="flex flex-col gap-2">
							<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
								Active instance
							</div>
							<Select
								value={field.state.value}
								onValueChange={(value) =>
									field.handleChange(value as MainRedisInstanceName)
								}
								items={MAIN_REDIS_INSTANCE_OPTIONS.map((option) => ({
									value: option.value,
									label: option.label,
								}))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{MAIN_REDIS_INSTANCE_OPTIONS.map((option) => (
											<SelectItem
												key={option.value}
												value={option.value}
												disabled={
													option.value === "fallback" && fallbackUnavailable
												}
											>
												<div className="flex flex-col">
													<span className="text-sm text-foreground">
														{option.label}
													</span>
													<span className="text-xs text-tertiary-foreground">
														{option.description}
													</span>
												</div>
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>

				<Alert>
					<AlertTitle>Switching drops in-flight state</AlertTitle>
					<AlertDescription>
						Locks and idempotency keys are not copied to the new instance. Only
						switch to a fallback that is already synchronized.
					</AlertDescription>
				</Alert>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						<Badge variant="muted">
							Fallback:{" "}
							{config.fallbackConfigured
								? config.fallbackStatus
								: "not configured"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<p className="text-pretty">
						{config.configConfigured === false
							? "S3 main Redis config is not configured. Traffic defaults to primary."
							: config.error ||
								"Changes propagate to servers, workers, and cron within 10 seconds."}
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
				<form.Subscribe
					selector={(state) => ({
						activeInstance: state.values.activeInstance,
						isSubmitting: state.isSubmitting,
					})}
				>
					{({ activeInstance, isSubmitting }) => (
						<Button
							variant="primary"
							onClick={() => form.handleSubmit()}
							isLoading={isSubmitting}
							disabled={activeInstance === config.activeInstance}
						>
							Save
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</>
	);
};
