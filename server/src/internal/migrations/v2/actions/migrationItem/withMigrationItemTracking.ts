import type { Migration } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { migrationItemRunRepo } from "../../repos/index.js";
import type { RunScopeItem } from "../../run/types/runScope.js";

export const withMigrationItemTracking = async <T>({
	ctx,
	migration,
	item,
	dryRun,
	run,
}: {
	ctx: AutumnContext;
	migration: Migration;
	item: RunScopeItem;
	dryRun: boolean;
	run: () => Promise<T>;
}): Promise<T | undefined> => {
	if (dryRun) return run();

	const claim = await migrationItemRunRepo.claim({
		ctx,
		migrationInternalId: migration.internal_id,
		itemKind: item.kind,
		itemId: item.internal_id,
		claimBehavior: migration.retry_failed ? "retry_failed" : "claim_new",
	});

	if (!claim.claimed) {
		ctx.logger.info("run-migration: item already claimed", {
			data: {
				kind: item.kind,
				itemId: item.internal_id,
				status: claim.itemRun?.status,
			},
		});
		return undefined;
	}

	try {
		const result = await run();
		await migrationItemRunRepo.markSucceeded({
			ctx,
			migrationInternalId: migration.internal_id,
			itemKind: item.kind,
			itemId: item.internal_id,
		});
		return result;
	} catch (error) {
		await migrationItemRunRepo.markFailed({
			ctx,
			migrationInternalId: migration.internal_id,
			itemKind: item.kind,
			itemId: item.internal_id,
		});
		throw error;
	}
};
