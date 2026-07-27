import { Button, FormLabel, Input } from "@autumn/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { CACHE_V2_RAMP_QUERY_KEY } from "./cacheV2RampTypes";

export const CacheV2RampSetupForm = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const [connectionString, setConnectionString] = useState("");

	const connectMutation = useMutation({
		mutationFn: async (uri: string) => {
			await axiosInstance.patch("/admin/cache-v2-ramp", {
				connectionString: uri,
			});
		},
		onSuccess: async () => {
			setConnectionString("");
			toast.success("Cache V2 ramp destination configured");
			await queryClient.invalidateQueries({
				queryKey: CACHE_V2_RAMP_QUERY_KEY,
			});
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to configure destination"));
		},
	});

	const handleConnect = () => {
		const trimmed = connectionString.trim();
		if (!trimmed) return;
		connectMutation.mutate(trimmed);
	};

	return (
		<div className="flex flex-col gap-3">
			<FormLabel>Destination connection string</FormLabel>
			<Input
				value={connectionString}
				onChange={(e) => setConnectionString(e.target.value)}
				placeholder="rediss://default:password@host:port"
				className="font-mono text-xs"
			/>
			<p className="text-pretty text-xs text-tertiary-foreground">
				Stored encrypted. Only the host is ever shown again. Ramp starts at 0%,
				so no traffic moves until you raise it.
			</p>
			<Button
				onClick={handleConnect}
				isLoading={connectMutation.isPending}
				disabled={!connectionString.trim()}
			>
				Configure destination
			</Button>
		</div>
	);
};
