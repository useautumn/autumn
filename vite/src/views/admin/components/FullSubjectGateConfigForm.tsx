import { Badge, Button, DialogFooter, Separator } from "@autumn/ui";
import { useStore } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	FULL_SUBJECT_GATE_LIMITS,
	FULL_SUBJECT_GATE_QUERY_KEY,
	type FullSubjectGateConfig,
	type FullSubjectGateFormValues,
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
			fleet_process_count: config.fleet_process_count as number | null,
			per_customer_limit: config.per_customer_limit as number | null,
			per_org_limit: config.per_org_limit as number | null,
			max_wait_ms: config.max_wait_ms as number | null,
			per_customer_pending_max: config.per_customer_pending_max as
				| number
				| null,
			per_org_pending_max: config.per_org_pending_max as number | null,
		},
		onSubmit: async ({ value }) => {
			if (
				value.fleet_process_count === null ||
				value.per_customer_limit === null ||
				value.per_org_limit === null ||
				value.max_wait_ms === null ||
				value.per_customer_pending_max === null ||
				value.per_org_pending_max === null
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
