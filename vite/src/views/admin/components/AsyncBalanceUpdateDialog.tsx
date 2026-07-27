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
import {
	ASYNC_BALANCE_UPDATE_DEFAULT_CONFIG,
	ASYNC_BALANCE_UPDATE_QUERY_KEY,
	type AsyncBalanceUpdateConfig,
} from "./asyncBalanceUpdateConfigTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { OrgAllowlistEdgeConfigForm } from "./OrgAllowlistEdgeConfigForm";

export function AsyncBalanceUpdateDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<AsyncBalanceUpdateConfig>({
		queryKey: ASYNC_BALANCE_UPDATE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<AsyncBalanceUpdateConfig>(
				"/admin/async-balance-update-config",
			);
			return { ...ASYNC_BALANCE_UPDATE_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Async Balance Updates
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Choose which orgs enqueue balances.update calls for background
						processing.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load async balance update config"
					skeleton={
						<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
							<Skeleton className="h-64" />
							<Skeleton className="h-64" />
						</div>
					}
				>
					{(config) => (
						<OrgAllowlistEdgeConfigForm
							key={config.lastSuccessAt ?? "never"}
							config={config}
							onClose={() => onOpenChange(false)}
							endpoint="/admin/async-balance-update-config"
							queryKey={ASYNC_BALANCE_UPDATE_QUERY_KEY}
							successMessage="Async balance update config saved"
							errorMessage="Failed to save async balance update config"
							enabledDescription="Listed org IDs or slugs enqueue balance updates. Everyone else runs them synchronously."
							emptyMessage="No orgs enabled — every balance update runs synchronously."
							missingConfigMessage="Async balance update config is missing in S3, so updates stay synchronous for every org."
							healthyConfigMessage="Saved changes reach all servers within 10 seconds."
							orgPlaceholder="Org ID or slug"
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
