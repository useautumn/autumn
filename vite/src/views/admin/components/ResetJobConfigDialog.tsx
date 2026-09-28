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
import { ResetJobConfigForm } from "./ResetJobConfigForm";
import {
	RESET_JOB_QUERY_KEY,
	type ResetJobConfig,
} from "./resetJobConfigTypes";

export const ResetJobConfigDialog = ({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<ResetJobConfig>({
		queryKey: RESET_JOB_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/reset-job-config");
			return data;
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Reset Job</DialogTitle>
					<DialogDescription className="text-pretty">
						Control the legacy serialized balance reset cron.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load Reset Job config"
				>
					{(config) => (
						<ResetJobConfigForm
							key={`${config.enabled}:${config.batchSize}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
};
