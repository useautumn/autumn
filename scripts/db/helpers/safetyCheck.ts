const INDEX_DDL = /^\s*(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX|REINDEX)\b/i;
const HAS_CONCURRENTLY = /\bCONCURRENTLY\b/i;

export type BlockingStatement = {
	kind: "CREATE INDEX" | "DROP INDEX" | "REINDEX";
	statement: string;
};

export function findBlockingIndexStatements(sql: string): BlockingStatement[] {
	const blockers: BlockingStatement[] = [];
	const statements = sql.split("--> statement-breakpoint");
	for (const raw of statements) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (!INDEX_DDL.test(trimmed)) continue;
		if (HAS_CONCURRENTLY.test(trimmed)) continue;
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
