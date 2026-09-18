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
import { DbControlConfigForm } from "./DbControlConfigForm";
import {
	DB_CONTROL_DEFAULTS,
	DB_CONTROL_QUERY_KEY,
	type DbControlConfig,
} from "./dbControlConfigTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";

export function DbControlDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<DbControlConfig>({
		queryKey: DB_CONTROL_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<DbControlConfig>(
				"/admin/db-control-config",
			);
			return { ...DB_CONTROL_DEFAULTS, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">DB Control</DialogTitle>
					<DialogDescription className="text-pretty">
						Live knobs on how our processes drive Postgres. Changes reach every
						worker within its poll interval, no deploy.
					</DialogDescription>
				</DialogHeader>
				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load DB control config"
					skeleton={<Skeleton className="h-20" />}
				>
					{(config) => (
						<DbControlConfigForm
							key={String(config.balanceCommitter.concurrency)}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
