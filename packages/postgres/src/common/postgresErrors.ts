/**
 * How to read an error from node-postgres: one Postgres sent is a `DatabaseError` whose `code` is its SQLSTATE,
 * while the driver's own failures (a refused, dropped or timed-out connection) carry a socket code or only a message.
 */

const SOCKET_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
]);
/** pg's and pg-pool's messages for a connection that failed, never answered or fell out of step; they carry no code. */
const DRIVER_CONNECTION_FAILURE =
	/^(Query read timeout|timeout expired|timeout exceeded when trying to connect|Connection terminated|Client has encountered a connection error and is not queryable|Client was closed and is not queryable|Received unexpected \w+ message from backend)/;
/** SQLSTATE classes worth a retry: the connection, a concurrency abort, a cancelled statement, a full pool, a shutdown. */
const TRANSIENT_SQLSTATE = /^(08|40001|40P01|57014|53300|57P0[123])/;

export const PostgresSqlState = {
	UniqueViolation: "23505",
	ForeignKeyViolation: "23503",
	InvalidTextRepresentation: "22P02",
} as const;

/** A `DatabaseError` carries the `severity` Postgres sent; only its `code` is a SQLSTATE. */
const isDatabaseError = (
	error: unknown,
): error is Error & { code: string; severity: string } =>
	error instanceof Error &&
	"severity" in error &&
	typeof (error as { code?: unknown }).code === "string";

/** The SQLSTATE of an error Postgres itself raised; null for the driver's own failures and anything else. */
export const postgresSqlStateOf = ({
	error,
}: {
	error: unknown;
}): string | null => (isDatabaseError(error) ? error.code : null);

/** The connection failed, not the statement: a socket error, or one the driver raised about its own connection. */
export const isPostgresConnectionFailure = ({
	error,
}: {
	error: unknown;
}): boolean => {
	if (!(error instanceof Error) || isDatabaseError(error)) return false;
	const { code } = error as Error & { code?: unknown };
	if (typeof code === "string" && SOCKET_ERROR_CODES.has(code)) return true;
	return DRIVER_CONNECTION_FAILURE.test(error.message);
};

/** The same statement can succeed once Postgres answers again; anything else would fail the same way on retry. */
export const isTransientPostgresError = ({
	error,
}: {
	error: unknown;
}): boolean => {
	const sqlState = postgresSqlStateOf({ error });
	if (sqlState) return TRANSIENT_SQLSTATE.test(sqlState);
	return isPostgresConnectionFailure({ error });
};
