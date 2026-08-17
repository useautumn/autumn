export type DelayedPostgresBackupReadConfig = {
	enabled: boolean;
	delay_ms: number;
	max_in_flight_per_process: number;
};

export type FullSubjectReplicaLaneConfig = {
	per_customer_limit: number;
	per_org_limit: number;
	per_customer_pending_max: number;
	per_org_pending_max: number;
};

export type FullSubjectReadSplitConfig = {
	replica_share: number;
};

export type FullSubjectGateConfig = {
	per_customer_limit: number;
	per_org_limit: number;
	max_wait_ms: number;
	per_customer_pending_max: number;
	per_org_pending_max: number;
	fleet_process_count: number;
	replica_lane: FullSubjectReplicaLaneConfig;
	read_split: FullSubjectReadSplitConfig;
	delayed_postgres_backup_read: DelayedPostgresBackupReadConfig;
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
	| "replica_lane"
	| "read_split"
	| "delayed_postgres_backup_read"
>;

export const FULL_SUBJECT_GATE_DEFAULTS: FullSubjectGateFormValues = {
	per_customer_limit: 200,
	per_org_limit: 500,
	max_wait_ms: 2_000,
	per_customer_pending_max: 500,
	per_org_pending_max: 1_000,
	fleet_process_count: 1,
	replica_lane: {
		per_customer_limit: 540,
		per_org_limit: 810,
		per_customer_pending_max: 1_500,
		per_org_pending_max: 3_000,
	},
	read_split: { replica_share: 0 },
	delayed_postgres_backup_read: {
		enabled: true,
		delay_ms: 1_000,
		max_in_flight_per_process: 1,
	},
};

type FullSubjectGateNumericField = Exclude<
	keyof FullSubjectGateFormValues,
	"replica_lane" | "read_split" | "delayed_postgres_backup_read"
>;

export const FULL_SUBJECT_GATE_LIMITS: Record<
	FullSubjectGateNumericField,
	{ min: number; max: number }
> = {
	fleet_process_count: { min: 1, max: 100_000 },
	per_customer_limit: { min: 1, max: 10_000 },
	per_org_limit: { min: 1, max: 10_000 },
	max_wait_ms: { min: 100, max: 60_000 },
	per_customer_pending_max: { min: 1, max: 100_000 },
	per_org_pending_max: { min: 1, max: 100_000 },
};

export const DELAYED_POSTGRES_BACKUP_READ_LIMITS = {
	delay_ms: { min: 500, max: 1_500 },
	max_in_flight_per_process: { min: 1, max: 10 },
} as const;

export const getFullSubjectGateFormValues = ({
	config,
}: {
	config: FullSubjectGateConfig;
}): FullSubjectGateFormValues => ({
	per_customer_limit: config.per_customer_limit,
	per_org_limit: config.per_org_limit,
	max_wait_ms: config.max_wait_ms,
	per_customer_pending_max: config.per_customer_pending_max,
	per_org_pending_max: config.per_org_pending_max,
	fleet_process_count: config.fleet_process_count,
	replica_lane: {
		per_customer_limit: config.replica_lane.per_customer_limit,
		per_org_limit: config.replica_lane.per_org_limit,
		per_customer_pending_max: config.replica_lane.per_customer_pending_max,
		per_org_pending_max: config.replica_lane.per_org_pending_max,
	},
	read_split: { replica_share: config.read_split.replica_share },
	delayed_postgres_backup_read: {
		enabled: config.delayed_postgres_backup_read.enabled,
		delay_ms: config.delayed_postgres_backup_read.delay_ms,
		max_in_flight_per_process:
			config.delayed_postgres_backup_read.max_in_flight_per_process,
	},
});

export const FULL_SUBJECT_GATE_QUERY_KEY = [
	"admin-edge-config",
	"full-subject-gate",
] as const;
