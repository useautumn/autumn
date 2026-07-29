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
import { StripeSyncConfigForm } from "./StripeSyncConfigForm";
import {
	STRIPE_SYNC_DEFAULT_CONFIG,
	STRIPE_SYNC_QUERY_KEY,
	type StripeSyncConfig,
} from "./stripeSyncConfigTypes";

export function StripeSyncDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<StripeSyncConfig>({
		queryKey: STRIPE_SYNC_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<StripeSyncConfig>(
				"/admin/stripe-sync-config",
			);
			return { ...STRIPE_SYNC_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Stripe Sync</DialogTitle>
					<DialogDescription className="text-pretty">
						Choose which orgs mirror their Stripe webhook events into the sync
						DB.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load stripe sync config"
					skeleton={
						<div className="grid grid-cols-[320px_1fr] gap-6">
							<Skeleton className="h-64" />
							<Skeleton className="h-64" />
						</div>
					}
				>
					{(config) => (
						<StripeSyncConfigForm
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
