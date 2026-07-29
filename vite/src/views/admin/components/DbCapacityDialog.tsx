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
import { DbCapacityConfigForm } from "./DbCapacityConfigForm";
import {
	DB_CAPACITY_DEFAULTS,
	DB_CAPACITY_QUERY_KEY,
	type DbCapacityConfig,
} from "./dbCapacityConfigTypes";
import { EdgeConfigDialogBody } from "./EdgeConfigDialogBody";

export function DbCapacityDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<DbCapacityConfig>({
		queryKey: DB_CAPACITY_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<DbCapacityConfig>(
				"/admin/db-capacity-config",
			);
			return { ...DB_CAPACITY_DEFAULTS, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">Database Capacity</DialogTitle>
					<DialogDescription className="text-pretty">
						Resize the HTTP database pools and keep their fleet-wide connection
						budget within the PgBouncer ceiling.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load database capacity config"
					skeleton={
						<div className="grid gap-4 md:grid-cols-2">
							{Array.from({ length: 6 }, (_, index) => (
								<Skeleton className="h-20" key={index} />
							))}
						</div>
					}
				>
					{(config) => (
						<DbCapacityConfigForm
							key={`${config.critical_pool_max}:${config.general_pool_max}:${config.replica_pool_max}:${config.pgbouncer_max_client_conn}:${config.budgeted_fleet_processes}:${config.budgeted_non_server_connections}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
