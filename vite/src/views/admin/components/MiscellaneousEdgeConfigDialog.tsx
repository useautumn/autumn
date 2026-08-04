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
import { MiscellaneousEdgeConfigForm } from "./MiscellaneousEdgeConfigForm";
import {
	MISCELLANEOUS_DEFAULT_CONFIG,
	MISCELLANEOUS_EDGE_CONFIG_QUERY_KEY,
	type MiscellaneousEdgeConfig,
} from "./miscellaneousEdgeConfigTypes";

export function MiscellaneousEdgeConfigDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MiscellaneousEdgeConfig>({
		queryKey: MISCELLANEOUS_EDGE_CONFIG_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<MiscellaneousEdgeConfig>(
				"/admin/miscellaneous-edge-config",
			);
			return {
				...MISCELLANEOUS_DEFAULT_CONFIG,
				...data,
				newFlatCusModel: data.newFlatCusModel ?? [],
				syncCoalesce: data.syncCoalesce ?? false,
				subjectLookupDbOnly: data.subjectLookupDbOnly ?? false,
				idempotencyDynamoRead: data.idempotencyDynamoRead ?? false,
			};
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Miscellaneous Edge Config
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Live rollout gates. Everything here changes production behavior the
						moment you save.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load miscellaneous edge config"
					skeleton={
						<div className="grid grid-cols-[300px_1fr] gap-6">
							<Skeleton className="h-64" />
							<Skeleton className="h-64" />
						</div>
					}
				>
					{(config) => (
						<MiscellaneousEdgeConfigForm
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
