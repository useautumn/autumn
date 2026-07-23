import { Skeleton, Switch } from "@autumn/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type ResetJobConfig = {
	enabled: boolean;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export function ResetJobToggle() {
	const axiosInstance = useAxiosInstance();
	const { data, isLoading, refetch } = useQuery<ResetJobConfig>({
		queryKey: ["admin-edge-config", "reset-job"],
		queryFn: async () => {
			const { data } = await axiosInstance.get<ResetJobConfig>(
				"/admin/reset-job-config",
			);
			return data;
		},
	});
	const mutation = useMutation({
		mutationFn: async (enabled: boolean) => {
			await axiosInstance.put("/admin/reset-job-config", { enabled });
			return enabled;
		},
		onSuccess: (enabled) => {
			toast.success(`Reset job ${enabled ? "enabled" : "disabled"}`);
			void refetch();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to update reset job"));
		},
	});

	if (isLoading) return <Skeleton className="h-5 w-24" />;

	const enabled = mutation.isPending
		? mutation.variables
		: (data?.enabled ?? false);

	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-tertiary-foreground">
				{data?.configHealthy === false
					? "Config unavailable"
					: enabled
						? "Enabled"
						: "Disabled"}
			</span>
			<Switch
				aria-label="Toggle reset job"
				checked={enabled}
				disabled={!data || mutation.isPending}
				onCheckedChange={(checked) => mutation.mutate(checked)}
			/>
		</div>
	);
}
