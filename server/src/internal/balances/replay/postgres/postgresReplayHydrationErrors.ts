import type { MeteringIdentity } from "@autumn/balance-engine";

export class PostgresReplayRedisUnavailableError extends Error {
	readonly code = "redis_unavailable" as const;

	constructor() {
		super("Redis is unavailable in Postgres replay hydration");
		this.name = "PostgresReplayRedisUnavailableError";
	}
}

export class PostgresReplaySourceClosedError extends Error {
	readonly code = "source_closed" as const;

	constructor() {
		super("Postgres replay hydration source is closed");
		this.name = "PostgresReplaySourceClosedError";
	}
}

export class PostgresReplayContextUnavailableError extends Error {
	readonly code = "context_unavailable" as const;

	constructor({ identity }: { identity: MeteringIdentity }) {
		super(
			`Postgres replay hydration context is unavailable for ${identity.orgId}/${identity.env}/${identity.customerId}`,
		);
		this.name = "PostgresReplayContextUnavailableError";
	}
}

export class PostgresReplayBaselineConflictError extends Error {
	readonly code = "baseline_conflict" as const;

	constructor({
		boundBaselineId,
		requestedBaselineId,
	}: {
		boundBaselineId: string;
		requestedBaselineId: string;
	}) {
		super(
			`Postgres replay hydration source is bound to baseline ${boundBaselineId} and cannot load baseline ${requestedBaselineId}`,
		);
		this.name = "PostgresReplayBaselineConflictError";
	}
}
