import { describe, expect, test } from "bun:test";
import {
	calculateBudgetedFleetConnections,
	DB_POOL_BUDGET_HEADROOM,
	DbCapacityConfigSchema,
	getDefaultDbCapacityConfig,
} from "@/internal/misc/dbCapacity/dbCapacityConfigSchemas.js";

describe("DB capacity edge config", () => {
	test("preserves the existing production defaults", () => {
		expect(getDefaultDbCapacityConfig({ isProduction: true })).toEqual({
			critical_pool_max: 22,
			general_pool_max: 14,
			replica_pool_max: 6,
			pgbouncer_max_client_conn: 7600,
			budgeted_fleet_processes: 150,
			budgeted_non_server_connections: 80,
		});
	});

	test("preserves smaller local pool defaults", () => {
		expect(getDefaultDbCapacityConfig({ isProduction: false })).toMatchObject({
			critical_pool_max: 10,
			general_pool_max: 10,
			replica_pool_max: 6,
		});
	});

	test("accepts coordinated pool and fleet budget changes", () => {
		const config = DbCapacityConfigSchema.parse({
			critical_pool_max: 30,
			general_pool_max: 20,
			replica_pool_max: 10,
			budgeted_fleet_processes: 100,
		});

		expect(calculateBudgetedFleetConnections({ config })).toBe(6080);
		expect(6080).toBeLessThanOrEqual(
			config.pgbouncer_max_client_conn * DB_POOL_BUDGET_HEADROOM,
		);
	});

	test("rejects a config whose fleet budget exceeds headroom", () => {
		expect(() =>
			DbCapacityConfigSchema.parse({
				critical_pool_max: 30,
				general_pool_max: 20,
				replica_pool_max: 10,
			}),
		).toThrow("fleet connection budget");
	});
});
