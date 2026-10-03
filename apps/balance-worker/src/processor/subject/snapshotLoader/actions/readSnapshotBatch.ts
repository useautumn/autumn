import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
} from "@autumn/balance-engine";
import {
	isTransientPostgresError,
	postgresSqlStateOf,
	type SubjectSnapshotRow,
} from "@autumn/postgres";
import type { SubjectScope } from "../../types/subject.js";

const STATEMENT_TIMEOUT = "57014";

export type SnapshotBatchRead =
	| { ok: true; rowsBySubject: Map<string, SubjectSnapshotRow> }
	/** Postgres refused the whole statement for a while: nobody is answered, the batch is asked again after a backoff. */
	| { ok: false; transient: true }
	/** Something about this batch is wrong: everyone in it goes to the full query. */
	| { ok: false; transient: false; cause: unknown };

/**
 * One SELECT for the batch. A statement timeout is one fat row somewhere: the batch is halved until the
 * halves answer, and a lone subject that still times out is read as absent and left to its full query.
 */
export const readSnapshotBatch = async ({
	scope,
	identities,
}: {
	scope: SubjectScope;
	identities: readonly MeteringIdentity[];
}): Promise<SnapshotBatchRead> => {
	try {
		const rows = await scope.ctx.db.readSubjectSnapshots({ identities });
		return { ok: true, rowsBySubject: bySubject({ rows }) };
	} catch (cause) {
		if (postgresSqlStateOf({ error: cause }) === STATEMENT_TIMEOUT)
			return bisect({ scope, identities });
		if (isTransientPostgresError({ error: cause }))
			return { ok: false, transient: true };
		return { ok: false, transient: false, cause };
	}
};

const bisect = async ({
	scope,
	identities,
}: {
	scope: SubjectScope;
	identities: readonly MeteringIdentity[];
}): Promise<SnapshotBatchRead> => {
	if (identities.length <= 1) return { ok: true, rowsBySubject: new Map() };
	const middle = Math.ceil(identities.length / 2);
	const halves = await Promise.all([
		readSnapshotBatch({ scope, identities: identities.slice(0, middle) }),
		readSnapshotBatch({ scope, identities: identities.slice(middle) }),
	]);
	const rowsBySubject = new Map<string, SubjectSnapshotRow>();
	for (const half of halves) {
		if (!half.ok) return half;
		for (const [key, row] of half.rowsBySubject) rowsBySubject.set(key, row);
	}
	return { ok: true, rowsBySubject };
};

const bySubject = ({ rows }: { rows: SubjectSnapshotRow[] }) =>
	new Map(
		rows.map((row) => [meteringIdentityToSubjectKey({ identity: row }), row]),
	);
