import { Badge, Button, DialogFooter, Separator, Switch } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	DELAYED_POSTGRES_BACKUP_READ_LIMITS,
	FULL_SUBJECT_GATE_LIMITS,
	FULL_SUBJECT_GATE_QUERY_KEY,
	type FullSubjectGateConfig,
	type FullSubjectGateFormValues,
	getFullSubjectGateFormValues,
} from "./fullSubjectGateConfigTypes";

export const FullSubjectGateConfigForm = ({
	config,
	onClose,
}: {
	config: FullSubjectGateConfig;
	onClose: () => void;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const initialValues = getFullSubjectGateFormValues({ config });
	const mutation = useMutation({
		mutationFn: async (nextConfig: FullSubjectGateFormValues) => {
			await axiosInstance.put("/admin/full-subject-gate-config", nextConfig);
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: FULL_SUBJECT_GATE_QUERY_KEY,
			});
			toast.success("FullSubject gate config saved");
			onClose();
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to save gate config"));
		},
	});
	const form = useAppForm({
		defaultValues: {
			fleet_process_count: initialValues.fleet_process_count as number | null,
			per_customer_limit: initialValues.per_customer_limit as number | null,
			per_org_limit: initialValues.per_org_limit as number | null,
			max_wait_ms: initialValues.max_wait_ms as number | null,
			per_customer_pending_max: initialValues.per_customer_pending_max as
				| number
				| null,
			per_org_pending_max: initialValues.per_org_pending_max as number | null,
			replica_lane: initialValues.replica_lane,
			read_split: initialValues.read_split,
			delayed_postgres_backup_read: {
				enabled: initialValues.delayed_postgres_backup_read.enabled,
				delay_ms: initialValues.delayed_postgres_backup_read.delay_ms as
					| number
					| null,
				max_in_flight_per_process: initialValues.delayed_postgres_backup_read
					.max_in_flight_per_process as number | null,
			},
		},
		onSubmit: async ({ value }) => {
			if (
				value.fleet_process_count === null ||
				value.per_customer_limit === null ||
				value.per_org_limit === null ||
				value.max_wait_ms === null ||
				value.per_customer_pending_max === null ||
				value.per_org_pending_max === null ||
				value.delayed_postgres_backup_read.delay_ms === null ||
				value.delayed_postgres_backup_read.max_in_flight_per_process === null
			) {
				return;
			}

			await mutation.mutateAsync({
				fleet_process_count: value.fleet_process_count,
				per_customer_limit: value.per_customer_limit,
				per_org_limit: value.per_org_limit,
				max_wait_ms: value.max_wait_ms,
				per_customer_pending_max: value.per_customer_pending_max,
				per_org_pending_max: value.per_org_pending_max,
				replica_lane: value.replica_lane,
				read_split: value.read_split,
				delayed_postgres_backup_read: {
					enabled: value.delayed_postgres_backup_read.enabled,
					delay_ms: value.delayed_postgres_backup_read.delay_ms,
					max_in_flight_per_process:
						value.delayed_postgres_backup_read.max_in_flight_per_process,
				},
			});
		},
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	return (
		<>
			<div className="flex flex-col gap-6">
				<div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
					<form.AppField name="fleet_process_count">
						{(field) => (
							<field.NumberField
								label="Fleet process count"
								description="Live replica count. Set to 1 for per-process caps."
								min={FULL_SUBJECT_GATE_LIMITS.fleet_process_count.min}
								max={FULL_SUBJECT_GATE_LIMITS.fleet_process_count.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="max_wait_ms">
						{(field) => (
							<field.NumberField
								label="Max queue wait (ms)"
								description="Requests waiting longer than this are rejected."
								min={FULL_SUBJECT_GATE_LIMITS.max_wait_ms.min}
								max={FULL_SUBJECT_GATE_LIMITS.max_wait_ms.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="per_customer_limit">
						{(field) => (
							<field.NumberField
								label="Per-customer concurrent limit"
								description="Database loads running at once for one customer."
								min={FULL_SUBJECT_GATE_LIMITS.per_customer_limit.min}
								max={FULL_SUBJECT_GATE_LIMITS.per_customer_limit.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="per_org_limit">
						{(field) => (
							<field.NumberField
								label="Per-org concurrent limit"
								description="Database loads running at once for one org."
								min={FULL_SUBJECT_GATE_LIMITS.per_org_limit.min}
								max={FULL_SUBJECT_GATE_LIMITS.per_org_limit.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="per_customer_pending_max">
						{(field) => (
							<field.NumberField
								label="Per-customer queue depth"
								description="Requests waiting per customer before new ones are rejected."
								min={FULL_SUBJECT_GATE_LIMITS.per_customer_pending_max.min}
								max={FULL_SUBJECT_GATE_LIMITS.per_customer_pending_max.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="per_org_pending_max">
						{(field) => (
							<field.NumberField
								label="Per-org queue depth"
								description="Requests waiting per org before new ones are rejected."
								min={FULL_SUBJECT_GATE_LIMITS.per_org_pending_max.min}
								max={FULL_SUBJECT_GATE_LIMITS.per_org_pending_max.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
				</div>

				<Separator />
				<form.AppField name="delayed_postgres_backup_read.enabled">
					{(field) => (
						<div className="flex items-center justify-between gap-6">
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium text-foreground">
									Delayed Postgres backup read
								</div>
								<div className="text-pretty text-xs text-tertiary-foreground">
									If the critical-pool read is still running after the delay,
									start the same read on the general pool. First success wins.
								</div>
							</div>
							<Switch
								aria-label="Enable delayed Postgres backup read"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.AppField>

				<div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
					<form.AppField name="delayed_postgres_backup_read.delay_ms">
						{(field) => (
							<field.NumberField
								label="Backup delay (ms)"
								description="Wait before starting the general-pool read."
								min={DELAYED_POSTGRES_BACKUP_READ_LIMITS.delay_ms.min}
								max={DELAYED_POSTGRES_BACKUP_READ_LIMITS.delay_ms.max}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
					<form.AppField name="delayed_postgres_backup_read.max_in_flight_per_process">
						{(field) => (
							<field.NumberField
								label="Backup reads per process"
								description="Maximum backup reads running concurrently."
								min={
									DELAYED_POSTGRES_BACKUP_READ_LIMITS.max_in_flight_per_process
										.min
								}
								max={
									DELAYED_POSTGRES_BACKUP_READ_LIMITS.max_in_flight_per_process
										.max
								}
								inputClassName="tabular-nums"
							/>
						)}
					</form.AppField>
				</div>

				<div className="flex flex-col gap-3 text-xs text-tertiary-foreground">
					<Separator />
					<div className="flex flex-wrap items-center gap-2">
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
							"Caps are cluster-wide: each process enforces the cap divided by the fleet process count. Changes propagate to all replicas within 10 seconds."}
					</p>
				</div>
			</div>

			<DialogFooter className="flex-wrap pt-2">
				{mutation.error && (
					<span role="alert" className="mr-auto text-xs text-destructive">
						{getBackendErr(mutation.error, "Failed to save config")}
					</span>
				)}
				<Button variant="secondary" onClick={onClose}>
					Cancel
				</Button>
				<Button
					variant="primary"
					onClick={() => form.handleSubmit()}
					isLoading={mutation.isPending}
					disabled={!isDirty || mutation.isPending}
				>
					Save
				</Button>
			</DialogFooter>
		</>
	);
};
