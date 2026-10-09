const INDEX_DDL = /^\s*(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|REINDEX)\b/i;
const HAS_CONCURRENTLY = /\bCONCURRENTLY\b/i;
const IDENTIFIER = `(?:"[^"]+"|\\w+)`;
const TABLE_NAME = `((?:${IDENTIFIER}\\.)?${IDENTIFIER})`;
// IF NOT EXISTS may hit an existing, populated table, so it earns no exemption.
const CREATE_TABLE = new RegExp(
	`CREATE\\s+TABLE\\s+(?!IF\\s+NOT\\s+EXISTS\\b)${TABLE_NAME}`,
	"gi",
);
const CREATE_INDEX_TARGET = new RegExp(
	`\\bON\\s+(?:ONLY\\s+)?${TABLE_NAME}`,
	"i",
);

export type BlockingStatement = {
	kind: "CREATE INDEX" | "DROP INDEX" | "REINDEX";
	statement: string;
};

const normalizeTableName = (name: string): string =>
	name
		.replaceAll('"', "")
		.replace(/^public\./i, "")
		.toLowerCase();

/** Tables created by these migrations: nothing can be waiting on their locks yet. */
export function findCreatedTables(sqls: string[]): Set<string> {
	const tables = new Set<string>();
	for (const sql of sqls) {
		for (const match of sql.matchAll(CREATE_TABLE)) {
			tables.add(normalizeTableName(match[1]));
		}
	}
	return tables;
}

const indexesNewTable = (
	statement: string,
	newTables: Set<string>,
): boolean => {
	if (!/^\s*CREATE/i.test(statement)) return false;
	const target = statement.match(CREATE_INDEX_TARGET)?.[1];
	return target !== undefined && newTables.has(normalizeTableName(target));
};

export function findBlockingIndexStatements(
	sql: string,
	newTables: Set<string> = new Set(),
): BlockingStatement[] {
	const blockers: BlockingStatement[] = [];
	const statements = sql.split("--> statement-breakpoint");
	for (const raw of statements) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (!INDEX_DDL.test(trimmed)) continue;
		if (HAS_CONCURRENTLY.test(trimmed)) continue;
		if (indexesNewTable(trimmed, newTables)) continue;
		const upper = trimmed.toUpperCase();
		const kind: BlockingStatement["kind"] = upper.startsWith("CREATE")
			? "CREATE INDEX"
			: upper.startsWith("DROP")
				? "DROP INDEX"
				: "REINDEX";
		blockers.push({ kind, statement: trimmed });
	}
	return blockers;
}
