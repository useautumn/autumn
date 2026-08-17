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
import { FullSubjectGateConfigForm } from "./FullSubjectGateConfigForm";
import {
	FULL_SUBJECT_GATE_DEFAULTS,
	FULL_SUBJECT_GATE_QUERY_KEY,
	type FullSubjectGateConfig,
} from "./fullSubjectGateConfigTypes";

export function FullSubjectGateDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const axiosInstance = useAxiosInstance();
	const configQuery = useQuery<FullSubjectGateConfig>({
		queryKey: FULL_SUBJECT_GATE_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get<FullSubjectGateConfig>(
				"/admin/full-subject-gate-config",
			);
			return { ...FULL_SUBJECT_GATE_DEFAULTS, ...data };
		},
		enabled: open,
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl bg-card">
				<DialogHeader>
					<DialogTitle className="text-balance">
						FullSubject Concurrency Gate
					</DialogTitle>
					<DialogDescription className="text-pretty">
						Cap how many FullSubject database loads run at once. Requests over
						the cap queue, then get rejected with a 429.
					</DialogDescription>
				</DialogHeader>

				<EdgeConfigDialogBody
					query={configQuery}
					errorMessage="Failed to load FullSubject gate config"
					skeleton={
						<div className="grid gap-4 md:grid-cols-2">
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
							<Skeleton className="h-20" />
						</div>
					}
				>
					{(config) => (
						<FullSubjectGateConfigForm
							key={`${config.fleet_process_count}:${config.per_customer_limit}:${config.per_org_limit}:${config.max_wait_ms}:${config.per_customer_pending_max}:${config.per_org_pending_max}:${config.delayed_postgres_backup_read.enabled}:${config.delayed_postgres_backup_read.delay_ms}:${config.delayed_postgres_backup_read.max_in_flight_per_process}`}
							config={config}
							onClose={() => onOpenChange(false)}
						/>
					)}
				</EdgeConfigDialogBody>
			</DialogContent>
		</Dialog>
	);
}
