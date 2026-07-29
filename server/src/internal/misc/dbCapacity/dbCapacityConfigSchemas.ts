import { z } from "zod/v4";

export const DB_POOL_BUDGET_HEADROOM = 0.85;

const productionDefaults = {
	critical_pool_max: 22,
	general_pool_max: 14,
	replica_pool_max: 6,
	pgbouncer_max_client_conn: 7_600,
	budgeted_fleet_processes: 150,
	budgeted_non_server_connections: 80,
} as const;

const DbCapacityConfigFieldsSchema = z.object({
	critical_pool_max: z.number().int().min(1).max(1_000).default(22),
	general_pool_max: z.number().int().min(1).max(1_000).default(14),
	replica_pool_max: z.number().int().min(1).max(1_000).default(6),
	pgbouncer_max_client_conn: z
		.number()
		.int()
		.min(1)
		.max(1_000_000)
		.default(7_600),
	budgeted_fleet_processes: z.number().int().min(1).max(100_000).default(150),
	budgeted_non_server_connections: z
		.number()
		.int()
		.min(0)
		.max(1_000_000)
		.default(80),
});

export type DbCapacityConfig = z.infer<typeof DbCapacityConfigFieldsSchema>;

export const calculateBudgetedFleetConnections = ({
	config,
}: {
	config: DbCapacityConfig;
}): number =>
	config.budgeted_fleet_processes *
		(config.critical_pool_max +
			config.general_pool_max +
			config.replica_pool_max) +
	config.budgeted_non_server_connections;

export const DbCapacityConfigSchema = DbCapacityConfigFieldsSchema.superRefine(
	(config, context) => {
		const budgetedFleetConnections = calculateBudgetedFleetConnections({
			config,
		});
		const budgetCeiling =
			config.pgbouncer_max_client_conn * DB_POOL_BUDGET_HEADROOM;

		if (budgetedFleetConnections > budgetCeiling) {
			context.addIssue({
				code: "custom",
				message: `DB fleet connection budget ${budgetedFleetConnections} exceeds ${DB_POOL_BUDGET_HEADROOM * 100}% of PgBouncer max_client_conn (${budgetCeiling})`,
			});
		}
	},
);

export const getDefaultDbCapacityConfig = ({
	isProduction,
}: {
	isProduction: boolean;
}): DbCapacityConfig =>
	DbCapacityConfigSchema.parse({
		...productionDefaults,
		...(isProduction
			? {}
			: {
					critical_pool_max: 10,
					general_pool_max: 10,
				}),
	});
