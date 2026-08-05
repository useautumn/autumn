import {
	Button,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	MISC_REDIS_CONFIG_QUERY_KEY,
	MISC_REDIS_INSTANCE_OPTIONS,
	type MiscRedisConfigResponse,
	type MiscRedisInstanceName,
} from "./miscRedisConfigTypes";

export const MiscRedisInstanceForm = ({
	config,
}: {
	config: MiscRedisConfigResponse;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [selected, setSelected] = useState(config.activeInstance);

	const switchMutation = useMutation({
		mutationFn: async (activeInstance: MiscRedisInstanceName) => {
			await axiosInstance.put("/admin/main-redis-cache-config", {
				activeInstance,
			});
		},
		onSuccess: async (_data, activeInstance) => {
			toast.success(`Active misc Redis set to "${activeInstance}"`);
			await queryClient.invalidateQueries({
				queryKey: MISC_REDIS_CONFIG_QUERY_KEY,
			});
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to switch misc Redis"));
		},
	});

	const flipWithLiveRamp =
		config.ramp !== null && selected !== config.activeInstance;

	return (
		<div className="flex flex-col gap-2">
			<div className="text-xs font-medium uppercase tracking-wide text-tertiary-foreground">
				Active instance
			</div>
			<div className="flex items-center gap-2">
				<Select
					value={selected}
					onValueChange={(value) => setSelected(value as MiscRedisInstanceName)}
					items={MISC_REDIS_INSTANCE_OPTIONS.map((option) => ({
						value: option.value,
						label: option.label,
					}))}
				>
					<SelectTrigger className="flex-1">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{MISC_REDIS_INSTANCE_OPTIONS.map((option) => {
								const routable =
									option.value === "main" || config.backupRoutable;
								return (
									<SelectItem
										key={option.value}
										value={option.value}
										disabled={!routable}
									>
										<div className="flex flex-col">
											<span className="text-sm text-foreground">
												{option.label}
											</span>
											<span className="text-xs text-tertiary-foreground">
												{routable
													? option.description
													: `${option.description} — no routable client yet`}
											</span>
										</div>
									</SelectItem>
								);
							})}
						</SelectGroup>
					</SelectContent>
				</Select>
				<Button
					size="sm"
					onClick={() => switchMutation.mutate(selected)}
					isLoading={switchMutation.isPending}
					disabled={selected === config.activeInstance}
				>
					Switch
				</Button>
			</div>
			<p className="text-pretty text-xs text-tertiary-foreground">
				{flipWithLiveRamp
					? "Switching completes the cutover and clears the ramp."
					: "Locks and idempotency keys are not copied across — switch only when the other instance can absorb losing them."}
			</p>
		</div>
	);
};
