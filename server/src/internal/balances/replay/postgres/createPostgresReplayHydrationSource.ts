import type { CustomerState, MeteringIdentity } from "@autumn/balance-engine";
import type { AppEnv, FullSubject } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { fullSubjectToCustomerState } from "../../balanceWorker/fullSubjectToCustomerState.js";
import type {
	ReplayHydrationBaseline,
	ReplayHydrationSelection,
	ReplayHydrationSource,
	ReplayHydrationSourceResult,
} from "../replayHydrationContracts.js";
import {
	buildReplayContextMetadata,
	createReplayHydrationContext,
	type ReplayContextMetadata,
} from "./postgresReplayHydrationContext.js";
import {
	PostgresReplayBaselineConflictError,
	PostgresReplayContextUnavailableError,
	PostgresReplaySourceClosedError,
} from "./postgresReplayHydrationErrors.js";
import {
	hasLifecycleWindowViolation,
	isSupportedBaseline,
	type ReplayHydrationRefusal,
	refusalFromConverterError,
	refuseMissing,
	refuseUnsupported,
	stateMatchesIdentity,
	subjectMatchesIdentity,
	toReplayAppEnv,
} from "./postgresReplayHydrationPolicy.js";
import {
	loadReplayFullSubject,
	loadReplayOrganization,
	type ReplayOrganizationLoader,
	type ReplaySubjectLoader,
} from "./postgresReplayHydrationPorts.js";

/** Repeatable read plus read only keeps one load on one frozen snapshot and
 *  makes any write attempt fail. Pool acquisition is bounded by the operator
 *  pool configuration, not by this statement timeout. */
const SNAPSHOT_TRANSACTION = {
	isolationLevel: "repeatable read",
	accessMode: "read only",
} as const;
const STATEMENT_TIMEOUT_MS = 2_000;

export type PostgresReplayHydrationSource = ReplayHydrationSource & {
	readContext(params: { identity: MeteringIdentity }): AutumnContext;
	close(): void;
};

type SnapshotOutcome =
	| ReplayHydrationRefusal
	| Readonly<{
			kind: "loaded";
			state: CustomerState;
			metadata: ReplayContextMetadata;
	  }>;

type SourceState = {
	db: DrizzleCli;
	logger: Logger;
	replayWindowMs: number;
	loadOrganization: ReplayOrganizationLoader;
	loadFullSubject: ReplaySubjectLoader;
	metadataByIdentity: Map<string, ReplayContextMetadata>;
	baseline?: ReplayHydrationBaseline;
	closed: boolean;
};

function identityKeyOf({ identity }: { identity: MeteringIdentity }): string {
	return JSON.stringify([identity.orgId, identity.env, identity.customerId]);
}

function assertSourceLive({
	state,
	signal,
}: {
	state: SourceState;
	signal: AbortSignal;
}): void {
	if (state.closed) throw new PostgresReplaySourceClosedError();
	signal.throwIfAborted();
}

/** One source serves one baseline: mixing capture times for the same org would
 *  silently blend two different frozen clocks. */
function bindBaseline({
	state,
	baseline,
}: {
	state: SourceState;
	baseline: ReplayHydrationBaseline;
}): void {
	const bound = state.baseline;
	if (!bound) {
		state.baseline = baseline;
		return;
	}
	if (bound.id === baseline.id && bound.capturedAtMs === baseline.capturedAtMs)
		return;
	throw new PostgresReplayBaselineConflictError({
		boundBaselineId: bound.id,
		requestedBaselineId: baseline.id,
	});
}

function convertSnapshot({
	ctx,
	metadata,
	fullSubject,
	selection,
	replayWindowMs,
}: {
	ctx: AutumnContext;
	metadata: ReplayContextMetadata;
	fullSubject: FullSubject;
	selection: ReplayHydrationSelection;
	replayWindowMs: number;
}): SnapshotOutcome {
	const { identity, baseline, featureIds } = selection;
	if (!subjectMatchesIdentity({ fullSubject, identity }))
		return refuseUnsupported({ reason: "subject_mismatch" });
	let state: CustomerState;
	try {
		state = fullSubjectToCustomerState({ ctx, fullSubject, featureIds });
	} catch (cause) {
		const refusal = refusalFromConverterError({ cause });
		if (!refusal) throw cause;
		return refusal;
	}
	if (!stateMatchesIdentity({ state, identity }))
		return refuseUnsupported({ reason: "subject_mismatch" });
	if (
		hasLifecycleWindowViolation({
			fullSubject,
			featureIds,
			runEndMs: baseline.capturedAtMs + replayWindowMs,
		})
	)
		return refuseUnsupported({ reason: "lifecycle_window" });
	return { kind: "loaded", state, metadata };
}

async function readFrozenSnapshot({
	state,
	selection,
	env,
	signal,
	transaction,
}: {
	state: SourceState;
	selection: ReplayHydrationSelection;
	env: AppEnv;
	signal: AbortSignal;
	transaction: DrizzleCli;
}): Promise<SnapshotOutcome> {
	const { identity, baseline } = selection;
	await transaction.execute(
		sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
	);
	assertSourceLive({ state, signal });

	const organization = await state.loadOrganization({
		db: transaction,
		orgId: identity.orgId,
		env,
	});
	assertSourceLive({ state, signal });
	if (!organization) return refuseMissing({ reason: "organization_not_found" });

	const metadata = buildReplayContextMetadata({
		identity,
		env,
		baseline,
		org: organization.org,
		features: organization.features,
	});
	const ctx = createReplayHydrationContext({
		metadata,
		db: transaction,
		logger: state.logger,
	});
	const subject = await state.loadFullSubject({
		ctx,
		customerId: identity.customerId,
		readFrom: "primary",
		runLazyResets: false,
		asOfTimestampMs: baseline.capturedAtMs,
	});
	assertSourceLive({ state, signal });
	if (!subject) return refuseMissing({ reason: "customer_not_found" });

	return convertSnapshot({
		ctx,
		metadata,
		fullSubject: subject.fullSubject,
		selection,
		replayWindowMs: state.replayWindowMs,
	});
}

/** Runs only after the snapshot transaction resolved and the load is still
 *  live, so a commit failure, refusal or abort leaves no response context. */
function publishSnapshot({
	state,
	identityKey,
	outcome,
}: {
	state: SourceState;
	identityKey: string;
	outcome: SnapshotOutcome;
}): ReplayHydrationSourceResult {
	if (outcome.kind === "refused") {
		state.metadataByIdentity.delete(identityKey);
		return {
			kind: "refused",
			category: outcome.category,
			reason: outcome.reason,
		};
	}
	state.metadataByIdentity.set(identityKey, outcome.metadata);
	return { kind: "loaded", state: outcome.state };
}

async function loadSnapshot({
	state,
	selection,
	signal,
}: {
	state: SourceState;
	selection: ReplayHydrationSelection;
	signal: AbortSignal;
}): Promise<ReplayHydrationSourceResult> {
	assertSourceLive({ state, signal });
	if (
		!isSupportedBaseline({
			capturedAtMs: selection.baseline.capturedAtMs,
			replayWindowMs: state.replayWindowMs,
		})
	)
		return refuseUnsupported({ reason: "invalid_baseline" });
	bindBaseline({ state, baseline: selection.baseline });

	const env = toReplayAppEnv({ env: selection.identity.env });
	if (!env) return refuseUnsupported({ reason: "env_not_supported" });

	const identityKey = identityKeyOf({ identity: selection.identity });
	try {
		const outcome = await state.db.transaction(
			(transaction) =>
				readFrozenSnapshot({
					state,
					selection,
					env,
					signal,
					transaction: transaction as unknown as DrizzleCli,
				}),
			SNAPSHOT_TRANSACTION,
		);
		assertSourceLive({ state, signal });
		return publishSnapshot({ state, identityKey, outcome });
	} catch (cause) {
		state.metadataByIdentity.delete(identityKey);
		throw cause;
	}
}

/** Synchronous and detached: the returned context reads through the source db,
 *  never through the snapshot transaction, and performs no I/O. */
function readSourceContext({
	state,
	identity,
}: {
	state: SourceState;
	identity: MeteringIdentity;
}): AutumnContext {
	const metadata = state.closed
		? undefined
		: state.metadataByIdentity.get(identityKeyOf({ identity }));
	if (!metadata) throw new PostgresReplayContextUnavailableError({ identity });
	return createReplayHydrationContext({
		metadata,
		db: state.db,
		logger: state.logger,
	});
}

function closeSource({ state }: { state: SourceState }): void {
	state.closed = true;
	state.metadataByIdentity.clear();
}

export function createPostgresReplayHydrationSource({
	db,
	logger,
	replayWindowMs,
	loadOrganization = loadReplayOrganization,
	loadFullSubject = loadReplayFullSubject,
}: {
	db: DrizzleCli;
	logger: Logger;
	replayWindowMs: number;
	loadOrganization?: ReplayOrganizationLoader;
	loadFullSubject?: ReplaySubjectLoader;
}): PostgresReplayHydrationSource {
	if (!Number.isSafeInteger(replayWindowMs) || replayWindowMs < 0)
		throw new Error("replayWindowMs must be a nonnegative safe integer");
	const state: SourceState = {
		db,
		logger,
		replayWindowMs,
		loadOrganization,
		loadFullSubject,
		metadataByIdentity: new Map(),
		closed: false,
	};
	return {
		load: ({ selection, signal }) => loadSnapshot({ state, selection, signal }),
		readContext: ({ identity }) => readSourceContext({ state, identity }),
		close: () => closeSource({ state }),
	};
}
