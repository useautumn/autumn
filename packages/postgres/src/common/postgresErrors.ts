/**
 * How to read an error from Bun's Postgres driver: a server error carries its SQLSTATE in `errno`,
 * while the driver names its own failures (a refused, closed or timed-out connection) in `code`.
 */

const BUN_SERVER_ERROR_CODE = "ERR_POSTGRES_SERVER_ERROR";
const SOCKET_ERROR_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EPIPE",
	"ETIMEDOUT",
]);
/** SQLSTATE classes worth a retry: the connection, a concurrency abort, a cancelled statement, a full pool, a shutdown. */
const TRANSIENT_SQLSTATE = /^(08|40001|40P01|57014|53300|57P0[123])/;

export const PostgresSqlState = {
	UniqueViolation: "23505",
	ForeignKeyViolation: "23503",
} as const;

const fieldsOf = (
	error: unknown,
): { errno: string | null; code: string | null } => {
	if (!(error instanceof Error)) return { errno: null, code: null };
	const { errno, code } = error as Error & { errno?: unknown; code?: unknown };
	return {
		errno: typeof errno === "string" ? errno : null,
		code: typeof code === "string" ? code : null,
	};
};

/** The SQLSTATE of an error Postgres itself raised; null for the driver's own failures and anything else. */
export const postgresSqlStateOf = ({
	error,
}: {
	error: unknown;
}): string | null => fieldsOf(error).errno;

/** The connection failed, not the statement: a socket error, or one the driver raised about its own connection. */
export const isPostgresConnectionFailure = ({
	error,
}: {
	error: unknown;
}): boolean => {
	const { code } = fieldsOf(error);
	if (!code) return false;
	if (SOCKET_ERROR_CODES.has(code)) return true;
	return code.startsWith("ERR_POSTGRES_") && code !== BUN_SERVER_ERROR_CODE;
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
