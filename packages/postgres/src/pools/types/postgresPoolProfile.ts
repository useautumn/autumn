export type PostgresPoolProfile = {
	applicationName: string | null;
	maxConnections: number;
	minConnections: number;
	connectTimeoutMs: number;
	idleTimeoutMs: number;
	queryTimeoutMs: number | null;
	statementTimeoutMs: number | null;
};
