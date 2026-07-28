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
	ASYNC_TRACK_DEFAULT_CONFIG,
	ASYNC_TRACK_QUERY_KEY,
	type AsyncTrackConfig,
} from "./asyncTrackConfigTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { OrgAllowlistEdgeConfigForm } from "./OrgAllowlistEdgeConfigForm";

export function AsyncTrackDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<AsyncTrackConfig>({
		queryKey: ASYNC_TRACK_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<AsyncTrackConfig>(
				"/admin/async-track-config",
			);
			return { ...ASYNC_TRACK_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Async Track</DialogTitle>
					<DialogDescription className="text-pretty">
						Choose which orgs enqueue Track requests for background processing.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load async Track config"
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
							endpoint="/admin/async-track-config"
							queryKey={ASYNC_TRACK_QUERY_KEY}
							successMessage="Async Track config saved"
							errorMessage="Failed to save async Track config"
							enabledDescription="Listed org IDs or slugs enqueue Track requests. Everyone else processes them synchronously."
							emptyMessage="No orgs enabled — every Track request is processed synchronously unless it sets async."
							missingConfigMessage="Async Track config is missing in S3, so no org is enabled by default."
							healthyConfigMessage="Saved changes reach all servers within 10 seconds."
							orgPlaceholder="Org ID or slug"
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
