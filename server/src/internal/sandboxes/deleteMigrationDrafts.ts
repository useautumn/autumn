import { ErrCode, RecaseError } from "@autumn/shared";
import type { RepoContext } from "@/db/repoContext.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";

/** `deleteMigration` refuses a draft that already ran against customers; that
 *  one stays behind rather than failing the whole reset. */
const isRunHistoryRefusal = ({ error }: { error: unknown }): boolean =>
	error instanceof RecaseError &&
	error.code === ErrCode.InvalidRequest &&
	error.statusCode === 400;

/** Deletes every non-archived migration of the org + env `ctx` names, and
 *  returns the ids that went. */
export const deleteMigrationDrafts = async ({
	ctx,
}: {
	ctx: RepoContext;
}): Promise<string[]> => {
	const drafts = await migrationRepo.get({ ctx, archived: false });
	const deleted: string[] = [];

	for (const draft of drafts) {
		try {
			await migrationRepo.delete({ ctx, id: draft.id });
			deleted.push(draft.id);
		} catch (error) {
			if (!isRunHistoryRefusal({ error })) throw error;
			ctx.logger.warn(
				`sandbox reset: kept migration ${draft.id}, it has customer run history`,
			);
		}
	}

	return deleted;
};
