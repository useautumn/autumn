import {
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
	REDIS_V2_CACHE_QUERY_KEY,
	REDIS_V2_INSTANCE_OPTIONS,
	type RedisV2CacheConfig,
	type RedisV2InstanceName,
} from "./redisV2CacheConfigTypes";

export const RedisV2CacheForm = ({
	config,
	onClose,
}: {
	config: RedisV2CacheConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (activeInstance: RedisV2InstanceName) => {
			await axiosInstance.put("/admin/redis-v2-cache-config", {
				activeInstance,
			});
		},
		onSuccess: async (_data, activeInstance) => {
			await queryClient.invalidateQueries({
				queryKey: REDIS_V2_CACHE_QUERY_KEY,
			});
			toast.success(`Active V2 Redis set to "${activeInstance}"`);
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to switch V2 Redis"));
		},
	});
	const form = useAppForm({
		defaultValues: { activeInstance: config.activeInstance },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value.activeInstance);
		},
	});

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
									field.handleChange(value as RedisV2InstanceName)
								}
								items={REDIS_V2_INSTANCE_OPTIONS.map((option) => ({
									value: option.value,
									label: option.label,
								}))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{REDIS_V2_INSTANCE_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
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
							<p className="text-xs text-tertiary-foreground">
								Currently serving traffic:{" "}
								<span className="font-mono text-foreground">
									{config.activeInstance}
								</span>
							</p>
						</div>
					)}
				</form.Field>

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
							? "S3 V2 Redis config is not configured. Traffic defaults to Upstash."
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
