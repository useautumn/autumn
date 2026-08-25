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
import { MeteringShadowForm } from "./MeteringShadowForm";
import {
	METERING_SHADOW_DEFAULT_CONFIG,
	METERING_SHADOW_QUERY_KEY,
	type MeteringShadowConfig,
} from "./meteringShadowConfigTypes";

export function MeteringShadowDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<MeteringShadowConfig>({
		queryKey: METERING_SHADOW_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<MeteringShadowConfig>(
				"/admin/metering-shadow-config",
			);
			return { ...METERING_SHADOW_DEFAULT_CONFIG, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						Metering Shadow Tap
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Mirror committed deductions onto the metering events topic, globally
						or for a chosen set of orgs.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load metering shadow config"
				>
					{(config) => (
						<MeteringShadowForm
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
