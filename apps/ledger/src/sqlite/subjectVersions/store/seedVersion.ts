import { sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { subjectVersions } from "../../common/schema/subjectVersions.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

// A re-import must never rewind the sequence: the projection can be behind the
// entries this process has already appended.
const seedStatement = definePreparedQuery({
	build: (db) =>
		db
			.insert(subjectVersions)
			.values({
				internal_customer_id: sql`${sql.placeholder("internalCustomerId")}`,
				version: sql`${sql.placeholder("version")}`,
			})
			.onConflictDoUpdate({
				target: subjectVersions.internal_customer_id,
				set: {
					version: sql`max(${subjectVersions.version}, excluded.version)`,
				},
			})
			.prepare(),
});

export const seedVersion = ({
	ctx,
	internalCustomerId,
	version,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
	version: number;
}): void => {
	seedStatement({ ctx }).run({ internalCustomerId, version });
};
