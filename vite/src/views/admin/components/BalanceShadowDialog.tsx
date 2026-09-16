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
import { BalanceShadowConfigForm } from "./BalanceShadowConfigForm";
import {
	BALANCE_SHADOW_QUERY_KEY,
	type BalanceShadowConfig,
} from "./balanceShadowConfig";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";

export function BalanceShadowDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery({
		queryKey: BALANCE_SHADOW_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<BalanceShadowConfig>(
				"/admin/balance-shadow-config",
			);
			return data;
		},
		enabled: open,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[85dvh] max-w-2xl flex-col bg-card">
				<DialogHeader>
					<DialogTitle>Balance Shadow</DialogTitle>
					<DialogDescription>
						Configure a time-limited cohort to copy tracks alongside the
						existing system. Saving does not enable direct routing.
					</DialogDescription>
				</DialogHeader>
				{configQuery.isFetching ? (
					<Skeleton className="h-48" />
				) : (
					<EdgeConfigDialogBody
						query={configQuery}
						errorMessage="Failed to load Balance Shadow config"
					>
						{(config) => (
							<BalanceShadowConfigForm
								key={configQuery.dataUpdatedAt}
								config={config}
								onClose={() => onOpenChange(false)}
							/>
						)}
					</EdgeConfigDialogBody>
				)}
			</DialogContent>
		</Dialog>
	);
}
