export type DbCapacityConfig = {
	critical_pool_max: number;
	general_pool_max: number;
	replica_pool_max: number;
	pgbouncer_max_client_conn: number;
	budgeted_fleet_processes: number;
	budgeted_non_server_connections: number;
	configHealthy?: boolean;
	configConfigured?: boolean;
	lastSuccessAt?: string | null;
	error?: string | null;
};

export type DbCapacityFormValues = Pick<
	DbCapacityConfig,
	| "critical_pool_max"
	| "general_pool_max"
	| "replica_pool_max"
	| "pgbouncer_max_client_conn"
	| "budgeted_fleet_processes"
	| "budgeted_non_server_connections"
>;

export const DB_CAPACITY_DEFAULTS: DbCapacityFormValues = {
	critical_pool_max: 22,
	general_pool_max: 14,
	replica_pool_max: 6,
	pgbouncer_max_client_conn: 7_600,
	budgeted_fleet_processes: 150,
	budgeted_non_server_connections: 80,
};

export const DB_CAPACITY_LIMITS: Record<
	keyof DbCapacityFormValues,
	{ min: number; max: number }
> = {
	critical_pool_max: { min: 1, max: 1_000 },
	general_pool_max: { min: 1, max: 1_000 },
	replica_pool_max: { min: 1, max: 1_000 },
	pgbouncer_max_client_conn: { min: 1, max: 1_000_000 },
	budgeted_fleet_processes: { min: 1, max: 100_000 },
	budgeted_non_server_connections: { min: 0, max: 1_000_000 },
};

export const DB_CAPACITY_QUERY_KEY = [
	"admin-edge-config",
	"db-capacity",
] as const;
