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
import { MainRedisCacheForm } from "./MainRedisCacheForm";
import {
	MAIN_REDIS_CACHE_QUERY_KEY,
	type MainRedisCacheConfig,
} from "./mainRedisCacheConfigTypes";

export function MainRedisCacheDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MainRedisCacheConfig>({
		queryKey: MAIN_REDIS_CACHE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				"/admin/main-redis-cache-config",
			);
			return data;
		},
		enabled: open,
		refetchInterval: open ? 2_000 : false,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Main Redis Instance
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Route auth, idempotency, rate-limit, and lock traffic between the
						primary and fallback Redis.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load main Redis config"
					skeleton={
						<div className="flex flex-col gap-4">
							<Skeleton className="h-16" />
							<Skeleton className="h-20" />
						</div>
					}
				>
					{(config) => (
						<MainRedisCacheForm
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
