import { type SQL, sql } from "drizzle-orm";

/** Convert the compiler's `{ sql, params }` output to a Drizzle SQL chunk. */
export const rawWithParamsToDrizzle = ({
	sql: raw,
	params,
}: {
	sql: string;
	params: readonly unknown[];
}): SQL => {
	const parts = raw.split("?");
	if (parts.length - 1 !== params.length)
		throw new Error(
			`Placeholder/param count mismatch: ${parts.length - 1} placeholders vs ${params.length} params`,
		);
	const chunks: SQL[] = [];
	for (let i = 0; i < parts.length; i++) {
		chunks.push(sql.raw(parts[i]));
		if (i < params.length) chunks.push(sql`${params[i]}`);
	}
	return sql.join(chunks, sql.raw(""));
};
