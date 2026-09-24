import { Button } from "@autumn/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

type ModelPricingCacheStatus = {
	key: string;
	cached: boolean;
	ttlSeconds: number | null;
};

const MODEL_PRICING_CACHE_QUERY_KEY = ["admin-model-pricing-cache"] as const;

const formatTtl = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const ModelPricingCacheCard = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const { data, isPending, isError } = useQuery<ModelPricingCacheStatus>({
		queryKey: MODEL_PRICING_CACHE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/model-pricing-cache");
			return data;
		},
		staleTime: 15_000,
	});

	const clearMutation = useMutation({
		mutationFn: async () => {
			await axiosInstance.delete("/admin/model-pricing-cache");
		},
		onSuccess: async () => {
			toast.success("models.dev pricing cleared — the next track refetches it");
			await queryClient.invalidateQueries({
				queryKey: MODEL_PRICING_CACHE_QUERY_KEY,
			});
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to clear models.dev pricing"));
		},
	});

	const statusLabel = isError
		? "Unavailable"
		: data?.cached && data.ttlSeconds !== null
			? `Cached · refreshes in ${formatTtl(data.ttlSeconds)}`
			: "Not cached";

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700">
			<div className="flex items-start gap-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-tertiary-foreground">
					<Sparkles className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm font-medium text-foreground">
						models.dev pricing
					</div>
					<p className="mt-0.5 text-pretty text-xs text-tertiary-foreground">
						Model rates used by track_tokens. Clear to pick up a new model now
						instead of waiting for the 3h refresh.
					</p>
					{data && (
						<p className="mt-1 truncate font-mono text-[11px] text-tertiary-foreground">
							{data.key}
						</p>
					)}
				</div>
			</div>

			<div className="mt-auto flex items-center justify-between gap-2 pt-1">
				{isPending ? (
					<span className="h-4 w-24 animate-pulse rounded bg-muted" />
				) : (
					<span className="flex min-w-0 items-center gap-1.5 text-xs text-tertiary-foreground">
						<span
							className={`size-1.5 shrink-0 rounded-full ${data?.cached ? "bg-green-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
						/>
						<span className="truncate">{statusLabel}</span>
					</span>
				)}
				<Button
					variant="secondary"
					size="sm"
					onClick={() => clearMutation.mutate()}
					isLoading={clearMutation.isPending}
				>
					Clear
				</Button>
			</div>
		</div>
	);
};

export const CachesTab = () => (
	<div className="flex flex-col gap-3">
		<div className="flex flex-col gap-0.5">
			<h3 className="text-sm font-medium text-foreground">Global caches</h3>
			<p className="text-pretty text-xs text-tertiary-foreground">
				Force a refetch of shared, non-org caches without a deploy.
			</p>
		</div>

		<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
			<ModelPricingCacheCard />
		</div>
	</div>
);
