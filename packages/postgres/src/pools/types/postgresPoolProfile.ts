/** One pool's identity, size and clocks. Milliseconds throughout; `null` means no bound. */
export type PostgresPoolProfile = {
	/** Names the pool's connections in pg_stat_activity and the bouncer's logs. */
	applicationName: string | null;
	/** Pool ceiling per process; counts against the PgBouncer max_client_conn budget. */
	maxConnections: number;
	/** Warm floor pg-pool exempts from idle reaping. */
	minConnections: number;
	/** Deadline to open a connection, or to leave the queue of a full pool. */
	connectTimeoutMs: number;
	/** How long an idle connection stays open. */
	idleTimeoutMs: number;
	/** The client's read deadline: a query past it rejects and its connection leaves the pool. */
	queryTimeoutMs: number | null;
	/** Server-side statement_timeout the pool's statements run under: on the role, or SET LOCAL by the pool's own helper. */
	statementTimeoutMs: number | null;
};
