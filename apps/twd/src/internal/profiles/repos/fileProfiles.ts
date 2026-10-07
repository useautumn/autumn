import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { fileProfiles } from "../../../db/schema/profiles.ts";
import type { TwdDb } from "../../../lib/getDb.ts";
import type { TwdTx } from "../../accounts/repos/cleanAccountsRepo.ts";
import type { FileProfile } from "../types/fileProfile.ts";

const UPSERT_BATCH = 500;

/** Every profile of a worker class, or only the named files'. */
export const listFileProfiles = ({
	db,
	workerClass,
	files,
}: {
	db: TwdDb | TwdTx;
	workerClass: string;
	files?: string[];
}): Promise<FileProfile[]> =>
	db
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
	db,
	profiles,
}: {
	db: TwdDb | TwdTx;
	profiles: FileProfile[];
}) => {
	for (let start = 0; start < profiles.length; start += UPSERT_BATCH) {
		await db
			.insert(fileProfiles)
			.values(profiles.slice(start, start + UPSERT_BATCH))
			.onConflictDoUpdate({
				target: [fileProfiles.file, fileProfiles.workerClass],
				set: takeIncoming,
			});
	}
};
