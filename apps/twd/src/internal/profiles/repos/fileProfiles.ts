import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { fileProfiles } from "../../../db/schema/profiles.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { FileProfile } from "../types/fileProfile.ts";

const UPSERT_BATCH = 500;

/** Every profile of a worker class, or only the named files'. */
export const listFileProfiles = ({
	ctx,
	workerClass,
	files,
}: {
	ctx: TwdContext;
	workerClass: string;
	files?: string[];
}): Promise<FileProfile[]> =>
	ctx.db
		.select()
		.from(fileProfiles)
		.where(
			and(
				eq(fileProfiles.workerClass, workerClass),
				files ? inArray(fileProfiles.file, files) : undefined,
			),
		);

const {
	file: _file,
	workerClass: _workerClass,
	...updatableColumns
} = getTableColumns(fileProfiles);
const takeIncoming = Object.fromEntries(
	Object.entries(updatableColumns).map(([key, column]) => [
		key,
		sql.raw(`excluded."${column.name}"`),
	]),
);

export const upsertFileProfiles = async ({
	ctx,
	profiles,
}: {
	ctx: TwdContext;
	profiles: FileProfile[];
}) => {
	for (let start = 0; start < profiles.length; start += UPSERT_BATCH) {
		await ctx.db
			.insert(fileProfiles)
			.values(profiles.slice(start, start + UPSERT_BATCH))
			.onConflictDoUpdate({
				target: [fileProfiles.file, fileProfiles.workerClass],
				set: takeIncoming,
			});
	}
};
