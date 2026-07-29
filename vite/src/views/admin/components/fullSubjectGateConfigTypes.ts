export type FullSubjectGateConfig = {
	per_customer_limit: number;
	per_org_limit: number;
	max_wait_ms: number;
	per_customer_pending_max: number;
	per_org_pending_max: number;
	fleet_process_count: number;
	configHealthy?: boolean;
	configConfigured?: boolean;
	lastSuccessAt?: string | null;
	error?: string | null;
};

export type FullSubjectGateFormValues = Pick<
	FullSubjectGateConfig,
	| "per_customer_limit"
	| "per_org_limit"
	| "max_wait_ms"
	| "per_customer_pending_max"
	| "per_org_pending_max"
	| "fleet_process_count"
>;

export const FULL_SUBJECT_GATE_DEFAULTS: FullSubjectGateFormValues = {
	per_customer_limit: 200,
	per_org_limit: 500,
	max_wait_ms: 2_000,
	per_customer_pending_max: 500,
	per_org_pending_max: 1_000,
	fleet_process_count: 1,
};

export const FULL_SUBJECT_GATE_LIMITS: Record<
	keyof FullSubjectGateFormValues,
	{ min: number; max: number }
> = {
	fleet_process_count: { min: 1, max: 100_000 },
	per_customer_limit: { min: 1, max: 10_000 },
	per_org_limit: { min: 1, max: 10_000 },
	max_wait_ms: { min: 100, max: 60_000 },
	per_customer_pending_max: { min: 1, max: 100_000 },
	per_org_pending_max: { min: 1, max: 100_000 },
};

export const FULL_SUBJECT_GATE_QUERY_KEY = [
	"admin-edge-config",
	"full-subject-gate",
] as const;
