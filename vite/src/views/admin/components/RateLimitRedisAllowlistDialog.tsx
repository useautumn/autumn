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
import { RateLimitRedisAllowlistForm } from "./RateLimitRedisAllowlistForm";
import {
	DEFAULT_CONFIG,
	RATE_LIMIT_REDIS_ALLOWLIST_QUERY_KEY,
	type RateLimitRedisAllowlistConfig,
} from "./rateLimitRedisAllowlistDialogState";

export function RateLimitRedisAllowlistDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<RateLimitRedisAllowlistConfig>({
		queryKey: RATE_LIMIT_REDIS_ALLOWLIST_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<RateLimitRedisAllowlistConfig>(
				"/admin/rate-limit-redis-allowlist-config",
			);
			return { ...DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Rate Limit Redis Allowlist
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Counts these customers' Track and Check requests across all servers,
						not per server. Use it for high-volume customers who need their
						limit enforced exactly.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load rate limit redis allowlist"
					skeleton={
						<div className="grid grid-cols-[360px_1fr] gap-6">
							<Skeleton className="h-96" />
							<Skeleton className="h-96" />
						</div>
					}
				>
					{(config) => (
						<RateLimitRedisAllowlistForm
							key={config.lastSuccessAt ?? "never"}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
