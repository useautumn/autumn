import { expect, test } from "bun:test";
import type { MigrationItemRun } from "@autumn/shared";
import type { MigrationItemEvent } from "@/hooks/queries/useMigrationRunsQuery";
import { resolveMigrationItemStatus } from "./migrationItemStatus";

const skippedRun = {
	status: "skipped",
	skip_reason: "ineligible",
} as MigrationItemRun;

const event = ({ dryRun }: { dryRun: boolean }) =>
	({
		status: "skipped",
		dry_run: dryRun,
		response: null,
	}) as unknown as MigrationItemEvent;

test("a live skipped row surfaces its skip reason", () => {
	expect(
		resolveMigrationItemStatus({
			event: event({ dryRun: false }),
			itemRun: skippedRun,
			activeStatus: null,
		}),
	).toMatchObject({
		kind: "result",
		status: "skipped",
		skipReason: "ineligible",
	});
	expect(
		resolveMigrationItemStatus({
			event: undefined,
			itemRun: skippedRun,
			activeStatus: null,
		}),
	).toMatchObject({ kind: "result", skipReason: "ineligible" });
});

test("a dry-run event never borrows the live row's reason", () => {
	expect(
		resolveMigrationItemStatus({
			event: event({ dryRun: true }),
			itemRun: skippedRun,
			activeStatus: null,
		}),
	).toMatchObject({ kind: "result", dryRun: true, skipReason: null });
});

test("an active claim outranks any persisted result", () => {
	expect(
		resolveMigrationItemStatus({
			event: event({ dryRun: false }),
			itemRun: skippedRun,
			activeStatus: "queued",
		}),
	).toEqual({ kind: "queued" });
});
