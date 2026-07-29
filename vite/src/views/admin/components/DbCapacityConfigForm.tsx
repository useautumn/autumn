import { Badge, Button, DialogFooter, Separator } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	DB_CAPACITY_LIMITS,
	DB_CAPACITY_QUERY_KEY,
	type DbCapacityConfig,
	type DbCapacityFormValues,
} from "./dbCapacityConfigTypes";

const HEADROOM = 0.85;

export const DbCapacityConfigForm = ({
	config,
	onClose,
}: {
	config: DbCapacityConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: async (nextConfig: DbCapacityFormValues) => {
			await axiosInstance.put("/admin/db-capacity-config", nextConfig);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: DB_CAPACITY_QUERY_KEY,
			});
			toast.success("Database capacity config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save capacity config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			critical_pool_max: config.critical_pool_max as number | null,
			general_pool_max: config.general_pool_max as number | null,
			replica_pool_max: config.replica_pool_max as number | null,
			pgbouncer_max_client_conn: config.pgbouncer_max_client_conn as
				| number
				| null,
			budgeted_fleet_processes: config.budgeted_fleet_processes as
				| number
				| null,
			budgeted_non_server_connections: config.budgeted_non_server_connections as
				| number
				| null,
		},
		onSubmit: async ({ value }) => {
			const entries = Object.values(value);
			if (entries.some((entry) => entry === null)) return;

			await mutation.mutateAsync(value as DbCapacityFormValues);
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);
	const values = useStore(form.store, (state) => state.values);
	const allValuesPresent = Object.values(values).every(
		(value) => value !== null,
	);
	const budgetedConnections = allValuesPresent
		? (values.budgeted_fleet_processes as number) *
				((values.critical_pool_max as number) +
					(values.general_pool_max as number) +
					(values.replica_pool_max as number)) +
			(values.budgeted_non_server_connections as number)
		: null;
	const budgetCeiling = allValuesPresent
		? Math.floor((values.pgbouncer_max_client_conn as number) * HEADROOM)
		: null;
	const budgetIsValid =
		budgetedConnections !== null &&
		budgetCeiling !== null &&
		budgetedConnections <= budgetCeiling;

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
					<form.AppField name="critical_pool_max">
						{(field) => (
							<field.NumberField
								label="Critical pool max"
								description="Reserved for latency-sensitive customer routes."
								min={DB_CAPACITY_LIMITS.critical_pool_max.min}
								max={DB_CAPACITY_LIMITS.critical_pool_max.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="general_pool_max">
						{(field) => (
							<field.NumberField
								label="General pool max"
								description="All other HTTP database traffic."
								min={DB_CAPACITY_LIMITS.general_pool_max.min}
								max={DB_CAPACITY_LIMITS.general_pool_max.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="replica_pool_max">
						{(field) => (
							<field.NumberField
								label="Replica pool max"
								description="Fallback reads when the primary is degraded."
								min={DB_CAPACITY_LIMITS.replica_pool_max.min}
								max={DB_CAPACITY_LIMITS.replica_pool_max.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="pgbouncer_max_client_conn">
						{(field) => (
							<field.NumberField
								label="PgBouncer client ceiling"
								description="The configured max_client_conn value."
								min={DB_CAPACITY_LIMITS.pgbouncer_max_client_conn.min}
								max={DB_CAPACITY_LIMITS.pgbouncer_max_client_conn.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="budgeted_fleet_processes">
						{(field) => (
							<field.NumberField
								label="Budgeted fleet processes"
								description="Worst-case number of HTTP processes."
								min={DB_CAPACITY_LIMITS.budgeted_fleet_processes.min}
								max={DB_CAPACITY_LIMITS.budgeted_fleet_processes.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="budgeted_non_server_connections">
						{(field) => (
							<field.NumberField
								label="Other reserved connections"
								description="Workers, cron jobs, migrations, and direct clients."
								min={DB_CAPACITY_LIMITS.budgeted_non_server_connections.min}
								max={DB_CAPACITY_LIMITS.budgeted_non_server_connections.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
				</div>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							className={budgetIsValid ? undefined : "text-destructive"}
							variant="muted"
						>
							{budgetedConnections === null || budgetCeiling === null
								? "Complete all values"
								: `${budgetedConnections.toLocaleString()} / ${budgetCeiling.toLocaleString()} budgeted`}
						</Badge>
						<Badge variant="muted">
							{config.configHealthy ? "Config healthy" : "Config unavailable"}
						</Badge>
						<Badge variant="muted">
							{config.configConfigured ? "S3 set" : "Using defaults"}
						</Badge>
						{config.lastSuccessAt && (
							<span className="tabular-nums">
								Last refresh: {new Date(config.lastSuccessAt).toLocaleString()}
							</span>
						)}
					</div>
					<p className="text-pretty">
						{config.error ||
							"Changes propagate within 10 seconds. Lower limits drain surplus connections as active queries finish; no in-flight query is cancelled."}
					</p>
				</div>
			</div>

			<DialogFooter className="flex-wrap pt-2">
				{mutation.error && (
					<span role="alert" className="mr-auto text-xs text-destructive">
						{getBackendErr(mutation.error, "Failed to save capacity config")}
					</span>
				)}
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={mutation.isPending}
					disabled={!isDirty || !budgetIsValid || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
