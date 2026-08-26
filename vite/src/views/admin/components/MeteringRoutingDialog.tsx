import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";
import { MeteringRoutingForm } from "./MeteringRoutingForm";
import {
	METERING_ROUTING_DEFAULT_CONFIG,
	METERING_ROUTING_QUERY_KEY,
	type MeteringRoutingConfig,
} from "./meteringRoutingConfigTypes";

export function MeteringRoutingDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MeteringRoutingConfig>({
		queryKey: METERING_ROUTING_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<MeteringRoutingConfig>(
				"/admin/metering-routing-config",
			);
			return { ...METERING_ROUTING_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Metering Worker Routing
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Move check and track onto the metering worker one org at a time.
						Every failure falls back to Redis.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load metering routing config"
				>
					{(config) => (
						<MeteringRoutingForm
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
