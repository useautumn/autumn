import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import {
	_resetManagedDbPoolsForTesting,
	applyDbCapacityConfig,
	registerManagedDbPool,
} from "@/db/dbPoolCapacity.js";
import { DbCapacityConfigSchema } from "@/internal/misc/dbCapacity/dbCapacityConfigSchemas.js";

class TestPool extends EventEmitter {
	idleCount: number;
	totalCount: number;
	options: { max: number; maxUses: number; min: number };

	constructor({
		max,
		min = 0,
		totalCount = 0,
		idleCount = 0,
	}: {
		max: number;
		min?: number;
		totalCount?: number;
		idleCount?: number;
	}) {
		super();
		this.totalCount = totalCount;
		this.idleCount = idleCount;
		this.options = { max, maxUses: Number.POSITIVE_INFINITY, min };
	}

	connect = async () => {
		if (this.idleCount < 1) {
			throw new Error("No idle test client");
		}
		this.idleCount -= 1;

		return {
			release: (destroy?: boolean) => {
				this.emit("release");
				if (destroy) {
					this.totalCount -= 1;
					this.emit("remove");
					return;
				}
				this.idleCount += 1;
			},
		};
	};
}

const asPool = (pool: TestPool): Pool => pool as unknown as Pool;

describe("DB pool capacity", () => {
	afterEach(() => {
		_resetManagedDbPoolsForTesting();
	});

	test("applies the latest config when a managed pool registers", () => {
		applyDbCapacityConfig({
			config: DbCapacityConfigSchema.parse({
				critical_pool_max: 18,
				general_pool_max: 12,
				replica_pool_max: 5,
			}),
		});
		const criticalPool = new TestPool({ max: 22, min: 10 });

		registerManagedDbPool({
			name: "critical",
			pool: asPool(criticalPool),
		});

		expect(criticalPool.options.max).toBe(18);
		expect(criticalPool.options.min).toBe(10);
	});

	test("updates every managed pool without touching in-flight connections", () => {
		const criticalPool = new TestPool({ max: 22, min: 10, totalCount: 16 });
		const generalPool = new TestPool({ max: 14, totalCount: 12 });
		const replicaPool = new TestPool({ max: 6, totalCount: 5 });

		registerManagedDbPool({
			name: "critical",
			pool: asPool(criticalPool),
		});
		registerManagedDbPool({
			name: "general",
			pool: asPool(generalPool),
		});
		registerManagedDbPool({
			name: "replica",
			pool: asPool(replicaPool),
		});

		applyDbCapacityConfig({
			config: DbCapacityConfigSchema.parse({
				critical_pool_max: 15,
				general_pool_max: 10,
				replica_pool_max: 4,
				budgeted_fleet_processes: 100,
			}),
		});

		expect(criticalPool.options.max).toBe(15);
		expect(generalPool.options.max).toBe(10);
		expect(replicaPool.options.max).toBe(4);
		expect(criticalPool.totalCount).toBe(16);
		expect(generalPool.totalCount).toBe(12);
		expect(replicaPool.totalCount).toBe(5);
	});

	test("retires surplus clients on release and restores normal recycling at the target", () => {
		const criticalPool = new TestPool({ max: 22, min: 10, totalCount: 16 });
		registerManagedDbPool({
			name: "critical",
			pool: asPool(criticalPool),
		});

		applyDbCapacityConfig({
			config: DbCapacityConfigSchema.parse({
				critical_pool_max: 15,
				budgeted_fleet_processes: 100,
			}),
		});

		expect(criticalPool.options.maxUses).toBe(1);

		criticalPool.totalCount = 15;
		criticalPool.emit("release");

		expect(criticalPool.options.maxUses).toBe(Number.POSITIVE_INFINITY);
	});

	test("keeps the critical warm minimum within its configured maximum", () => {
		const criticalPool = new TestPool({ max: 22, min: 10 });
		registerManagedDbPool({
			name: "critical",
			pool: asPool(criticalPool),
		});

		applyDbCapacityConfig({
			config: DbCapacityConfigSchema.parse({
				critical_pool_max: 6,
				budgeted_fleet_processes: 100,
			}),
		});

		expect(criticalPool.options.min).toBe(6);
	});

	test("immediately drains idle clients stranded above a lower warm minimum", async () => {
		const criticalPool = new TestPool({
			max: 22,
			min: 10,
			totalCount: 10,
			idleCount: 10,
		});
		registerManagedDbPool({
			name: "critical",
			pool: asPool(criticalPool),
		});

		applyDbCapacityConfig({
			config: DbCapacityConfigSchema.parse({
				critical_pool_max: 6,
				budgeted_fleet_processes: 100,
			}),
		});
		await Bun.sleep(0);

		expect(criticalPool.totalCount).toBe(6);
		expect(criticalPool.idleCount).toBe(6);
		expect(criticalPool.options.maxUses).toBe(Number.POSITIVE_INFINITY);
	});
});
