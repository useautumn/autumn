import { Skeleton } from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import {
	RESET_JOB_QUERY_KEY,
	type ResetJobConfig,
	ResetJobConfigControl,
} from "./ResetJobConfigControl";

export function ResetJobControls() {
	const axiosInstance = useAxiosInstance();
	const { data, isLoading } = useQuery<ResetJobConfig>({
		queryKey: RESET_JOB_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<ResetJobConfig>(
				"/admin/reset-job-config",
			);
			return data;
		},
	});

	if (isLoading) return <Skeleton className="h-14 w-80" />;
	if (!data) {
		return (
			<span className="text-xs text-tertiary-foreground">
				Config unavailable
			</span>
		);
	}

	return (
		<ResetJobConfigControl
			key={`${data.enabled}:${data.batchSize}:${data.lastSuccessAt ?? "never"}`}
			config={data}
		/>
	);
}
