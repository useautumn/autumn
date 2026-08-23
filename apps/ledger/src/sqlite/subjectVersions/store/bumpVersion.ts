import { eq, sql } from "drizzle-orm";
import { definePreparedQuery } from "../../common/prepared/definePreparedQuery.js";
import { definePreparedRowQuery } from "../../common/prepared/definePreparedRowQuery.js";
import { subjectVersions } from "../../common/schema/subjectVersions.js";
import type { SqliteContext } from "../../common/types/sqliteContext.js";

const FIRST_VERSION = 1;

// `returning` costs sqlite several microseconds per call, and the bump already
// runs inside the writer loop's transaction, so the read is a second statement.
const bumpStatement = definePreparedQuery({
	build: (db) =>
		db
			.insert(subjectVersions)
			.values({
				internal_customer_id: sql`${sql.placeholder("internalCustomerId")}`,
				version: FIRST_VERSION,
			})
			.onConflictDoUpdate({
				target: subjectVersions.internal_customer_id,
				set: { version: sql`${subjectVersions.version} + 1` },
			})
			.prepare(),
});

const readVersion = definePreparedRowQuery<{ version: number }>({
	projection: { version: subjectVersions.version },
	build: ({ db, projection }) =>
		db
			.select(projection)
			.from(subjectVersions)
			.where(
				eq(
					subjectVersions.internal_customer_id,
					sql.placeholder("internalCustomerId"),
				),
			)
			.prepare(),
});

export const bumpVersion = ({
	ctx,
	internalCustomerId,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
}): number => {
	bumpStatement({ ctx }).run({ internalCustomerId });
	return readVersion({ ctx, placeholderValues: { internalCustomerId } })[0]
		.version;
};
