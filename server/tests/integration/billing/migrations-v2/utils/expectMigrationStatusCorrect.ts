import { expect } from "bun:test";
import type { MigrationStatus } from "@autumn/shared";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

export const expectMigrationStatusCorrect = async ({
	autumn,
	migrationId,
	status,
	blockedBy,
}: {
	autumn: AutumnInt;
	migrationId: string;
	status: MigrationStatus;
	blockedBy?: string | null;
}) => {
	const [list, runs] = await Promise.all([
		autumn.migrationsV2.list(),
		autumn.migrationsV2.listRuns({ migrationId }),
	]);
	const row = list.list.find((migration) => migration.id === migrationId);
	if (!row) throw new Error(`Migration ${migrationId} missing from list`);

	expect(row.status).toBe(status);
	expect(runs.status).toBe(status);
	if (blockedBy !== undefined) {
		expect(row.blocked_by).toBe(blockedBy);
		expect(runs.blocked_by).toBe(blockedBy);
	}
};
