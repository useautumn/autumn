import { createRequire } from "node:module";

type PgQuery = { text?: string; submit(connection: object): unknown };
type PgModule = { Query: { prototype: PgQuery } };

const inTransaction = new WeakSet<object>();

/** Lognormal around the median: prod's subject_rows p99/p50 of 1.97s/513ms is sigma 0.58. */
function sampleDelayMs({
	medianMs,
	sigma,
}: {
	medianMs: number;
	sigma: number;
}): number {
	const z =
		Math.sqrt(-2 * Math.log(1 - Math.random())) *
		Math.cos(2 * Math.PI * Math.random());
	return medianMs * Math.exp(sigma * z);
}

/** One wait per transaction or lone statement, as a PgBouncer in transaction mode makes a client wait for a server. */
function waitsForServer({
	connection,
	text,
}: {
	connection: object;
	text: string;
}): boolean {
	const statement = text.trimStart().slice(0, 8).toLowerCase();
	if (statement.startsWith("begin")) {
		inTransaction.add(connection);
		return true;
	}
	if (statement.startsWith("commit") || statement.startsWith("rollback")) {
		inTransaction.delete(connection);
		return false;
	}
	return !inTransaction.has(connection);
}

/**
 * Holds each query on its pooled connection before it reaches the wire while armed, so pool slots, the
 * subject-load gate and query timeouts all see the delay. SIGUSR2 toggles it.
 */
export function installPgLatency({
	medianMs,
	sigma,
	onToggle,
}: {
	medianMs: number;
	sigma: number;
	onToggle: (params: { armed: boolean }) => void;
}): void {
	const pg = createRequire(import.meta.resolve("@autumn/postgres"))(
		"pg",
	) as PgModule;
	const submit = pg.Query.prototype.submit;
	let armed = false;
	pg.Query.prototype.submit = function (this: PgQuery, connection: object) {
		const waits = waitsForServer({ connection, text: this.text ?? "" });
		if (!armed || !waits) return submit.call(this, connection);
		setTimeout(
			() => submit.call(this, connection),
			sampleDelayMs({ medianMs, sigma }),
		);
		return null;
	};
	process.on("SIGUSR2", () => {
		armed = !armed;
		onToggle({ armed });
	});
}
