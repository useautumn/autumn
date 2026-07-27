import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { RedisV2CacheForm } from "./RedisV2CacheForm";
import {
	REDIS_V2_CACHE_DEFAULTS,
	REDIS_V2_CACHE_QUERY_KEY,
	type RedisV2CacheConfig,
} from "./redisV2CacheConfigTypes";

export function RedisV2CacheDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<RedisV2CacheConfig>({
		queryKey: REDIS_V2_CACHE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<RedisV2CacheConfig>(
				"/admin/redis-v2-cache-config",
			);
			return { ...REDIS_V2_CACHE_DEFAULTS, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">V2 Redis Instance</DialogTitle>
					<DialogDescription className="text-pretty">
						Pick which Redis serves V2 cache reads and writes. Cached data is
						not copied across the switch.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load V2 Redis config"
					skeleton={
						<div className="flex flex-col gap-4">
							<Skeleton className="h-16" />
							<Skeleton className="h-20" />
						</div>
					}
				>
					{(config) => (
						<RedisV2CacheForm
							key={`${config.activeInstance}:${config.lastSuccessAt ?? "never"}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
