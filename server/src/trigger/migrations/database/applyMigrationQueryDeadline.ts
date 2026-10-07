import type { Pool } from "pg";

export const applyMigrationQueryDeadline = (_params: {
	pool: Pool;
	queryTimeoutMs: number;
}): void => {};
