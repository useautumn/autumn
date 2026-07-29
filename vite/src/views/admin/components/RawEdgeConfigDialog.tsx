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
import { RawEdgeConfigForm } from "./RawEdgeConfigForm";
import {
	RAW_REQUEST_BLOCK_QUERY_KEY,
	type RequestBlockFullConfig,
} from "./rawEdgeConfigTypes";

export const RawEdgeConfigDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	configId: "request-block";
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<RequestBlockFullConfig>({
		queryKey: RAW_REQUEST_BLOCK_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/request-block-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-5xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Raw Config — Request Blocking
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Saving overwrites the request blocking file for every org. Use the
						normal editor unless you need raw JSON.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load request blocking config"
					skeleton={
						<div className="grid gap-6 md:grid-cols-2">
							<Skeleton className="h-64" />
							<Skeleton className="h-64" />
						</div>
					}
				>
					{(config) => (
						<RawEdgeConfigForm
							key={config.lastSuccessAt ?? "never"}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
};
