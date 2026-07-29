import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CacheV2RampConfigForm } from "./CacheV2RampConfigForm";
import { CacheV2RampSetupForm } from "./CacheV2RampSetupForm";
import {
	type AdminCacheV2RampResponse,
	CACHE_V2_RAMP_QUERY_KEY,
} from "./cacheV2RampTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";

export function CacheV2RampDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const rampQuery = useQuery<AdminCacheV2RampResponse>({
		queryKey: CACHE_V2_RAMP_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<AdminCacheV2RampResponse>(
				"/admin/cache-v2-ramp",
			);
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Cache V2 Ramp</DialogTitle>
					<DialogDescription className="text-pretty">
						Gradually move customer cache traffic to a new V2 Redis. Only runs
						while the V2 instance is set to Dragonfly.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={rampQuery}
					errorMessage="Failed to load cache V2 ramp config"
					skeleton={
						<div className="flex flex-col gap-4">
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
							<Skeleton className="h-16" />
						</div>
					}
				>
					{({ cache_v2_ramp: ramp }) =>
						ramp ? (
							<CacheV2RampConfigForm
								key={`${ramp.host}:${ramp.migrationPercent}`}
								ramp={ramp}
							/>
						) : (
							<CacheV2RampSetupForm />
						)
					}
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
