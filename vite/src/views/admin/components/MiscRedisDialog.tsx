import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Separator,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { MiscRedisBackupForm } from "./MiscRedisBackupForm";
import { MiscRedisInstanceForm } from "./MiscRedisInstanceForm";
import { MiscRedisRampForm } from "./MiscRedisRampForm";
import {
	MISC_REDIS_CONFIG_QUERY_KEY,
	type MiscRedisConfigResponse,
} from "./miscRedisConfigTypes";

export function MiscRedisDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MiscRedisConfigResponse>({
		queryKey: MISC_REDIS_CONFIG_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<MiscRedisConfigResponse>(
				"/admin/misc-redis-config",
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
					<DialogTitle className="text-balance">Misc Redis</DialogTitle>
					<DialogDescription className="text-pretty">
						The instance serving auth, idempotency, rate-limit, and lock traffic
						— plus the percentage ramp for migrating its read-through caches to
						a new instance.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load misc Redis config"
					skeleton={
						<div className="flex flex-col gap-4">
							<Skeleton className="h-16" />
							<Skeleton className="h-20" />
							<Skeleton className="h-16" />
						</div>
					}
				>
					{(config) => (
						<div className="flex flex-col gap-5">
							<MiscRedisInstanceForm
								key={`instance:${config.activeInstance}`}
								config={config}
							/>
							<Separator />
							<MiscRedisRampForm
								key={`ramp:${config.ramp ? config.ramp.percent : "none"}`}
								config={config}
							/>
							<Separator />
							<MiscRedisBackupForm
								key={`backup:${config.backup?.host ?? "none"}`}
								config={config}
							/>

							<div className="flex flex-wrap items-center gap-2 text-xs text-tertiary-foreground">
								<Badge variant="muted">
									{config.configHealthy
										? "Config healthy"
										: "Config unavailable"}
								</Badge>
								{config.lastSuccessAt && (
									<span className="tabular-nums">
										Last refresh:{" "}
										{new Date(config.lastSuccessAt).toLocaleString()}
									</span>
								)}
								{config.error && (
									<span className="text-destructive">{config.error}</span>
								)}
							</div>
						</div>
					)}
				</EdgeConfigDialogBody>

				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
