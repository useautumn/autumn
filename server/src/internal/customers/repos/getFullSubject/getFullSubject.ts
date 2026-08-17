import {
	type CusProductStatus,
	type FullSubject,
	fullSubjectToFullCustomer,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type SubjectQueryRow,
} from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import { executePrepared } from "@/db/executePrepared.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	resolveSubjectReadDb,
	type SubjectReadFrom,
	type SubjectReadSource,
} from "@/db/resolveSubjectReadDb.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkPendingMigrationsForCustomer } from "@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js";
import { getRuntimeFullSubjectGateConfig } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js";
import { lazyResetSubjectEntitlements } from "../../actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "../../actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { markReplicaSourced } from "../../cache/fullSubject/subjectProvenance.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import {
	type FullSubjectGateLane,
	isFullSubjectGateRejection,
	runWithFullSubjectGate,
} from "./getFullSubjectGate.js";
import { getFullSubjectQuery } from "./getFullSubjectQuery.js";
import {
	type DelayedPostgresBackupReadEvent,
	runWithDelayedPostgresBackupRead,
} from "./runWithDelayedPostgresBackupRead.js";
import {
	resultToFullSubject,
	subjectQueryRowToNormalized,
} from "./subjectQueryRowToNormalized.js";
import { unpackSubjectEnvelope } from "./unpackSubjectEnvelope.js";

const BACKUP_READ_STATEMENT_TIMEOUT_MS = 2_000;

/** Runs the hydration on the resolved pool. A replica DB failure retries ONCE
 *  on primary via normal gate admission; a gate shed propagates untouched. */
const runRoutedHydration = async ({
	ctx,
	customerId,
	entityId,
	inStatuses,
	allowMissingEntity,
	readFrom,
	routeSource,
	useDelayedPostgresBackupRead,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses: CusProductStatus[];
	allowMissingEntity: boolean;
	readFrom: SubjectReadFrom;
	routeSource?: string;
	useDelayedPostgresBackupRead: boolean;
}): Promise<{ rows: SubjectQueryRow[]; source: SubjectReadSource }> => {
	const { org, env } = ctx;

	const runHydration = ({
		db,
		lane,
		statementTimeoutMs,
	}: {
		db: DrizzleCli;
		lane: FullSubjectGateLane;
		statementTimeoutMs?: number;
	}) =>
		runWithFullSubjectGate({
			customerId,
			orgId: org.id,
			env,
			lane,
			logger: ctx.logger,
			queryFn: () => {
				const execute = ({ queryDb }: { queryDb: DrizzleCli }) =>
					executePrepared({
						db: queryDb,
						label: "getFullSubject",
						query: getFullSubjectQuery({
							orgId: org.id,
							env,
							customerId,
							entityId,
							inStatuses,
							allowMissingEntity,
						}),
					});

				return statementTimeoutMs === undefined
					? execute({ queryDb: db })
					: withStatementTimeout(
							db,
							(transaction) => execute({ queryDb: transaction }),
							statementTimeoutMs,
						);
			},
		});

	const resolved = await resolveSubjectReadDb({
		ctx,
		readFrom,
		orgId: org.id,
		env,
		customerId,
	});

	let source: SubjectReadSource = resolved.source;
	let result: Awaited<ReturnType<typeof runHydration>>;

	if (resolved.source === "primary") {
		const { delayed_postgres_backup_read: backupReadConfig } =
			getRuntimeFullSubjectGateConfig();
		const startDelayedBackupRead =
			useDelayedPostgresBackupRead &&
			backupReadConfig.enabled &&
			resolved.db !== ctx.dbGeneral;

		if (!startDelayedBackupRead) {
			result = await runHydration({ db: resolved.db, lane: "primary" });
		} else {
			const logBackupReadEvent = (outcome: DelayedPostgresBackupReadEvent) => {
				const fields = {
					type: "delayed_postgres_backup_read",
					outcome,
					route: routeSource,
					customer_id: customerId,
					entity_id: entityId,
					delay_ms: backupReadConfig.delay_ms,
				};
				if (outcome === "both_failed") {
					ctx.logger.warn(fields, "Both primary hydration reads failed");
				} else {
					ctx.logger.info(fields, "Delayed Postgres backup read event");
				}
			};

			result = await runWithDelayedPostgresBackupRead({
				primaryFn: () => runHydration({ db: resolved.db, lane: "primary" }),
				backupFn: () =>
					runHydration({
						db: ctx.dbGeneral,
						lane: "backup",
						statementTimeoutMs: BACKUP_READ_STATEMENT_TIMEOUT_MS,
					}),
				delayMs: backupReadConfig.delay_ms,
				maxInFlightBackups: backupReadConfig.max_in_flight_per_process,
				shouldStartBackupOnError: (error) =>
					!isFullSubjectGateRejection(error) && isTransientDbError({ error }),
				onEvent: logBackupReadEvent,
			});
		}
	} else {
		try {
			result = await runHydration({ db: resolved.db, lane: resolved.source });
		} catch (error) {
			if (resolved.source !== "replica") throw error;
			// A gate shed is load protection — re-admitting it on primary defeats it.
			if (isFullSubjectGateRejection(error)) throw error;
			source = "primary";
			ctx.logger.warn(
				{
					type: "replica_read",
					source: "primary_fallback",
					route: routeSource,
					customer_id: customerId,
					entity_id: entityId,
					error: error instanceof Error ? error.message : String(error),
				},
				"Replica hydration failed — retrying once on primary",
			);
			result = await runHydration({ db: ctx.db, lane: "primary" });
		}
	}

	if (source === "replica") {
		ctx.logger.info(
			{
				type: "replica_read",
				source: "replica",
				route: routeSource,
				customer_id: customerId,
				entity_id: entityId,
			},
			"FullSubject hydrated from replica",
		);
	}

	return { rows: unpackSubjectEnvelope({ rows: result ?? [] }), source };
};

/** Fetch full subject from DB and return as FullSubject. Runs lazy reset. */
export async function getFullSubject({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
	readFrom = "primary",
	routeSource,
	useDelayedPostgresBackupRead = false,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	readFrom?: SubjectReadFrom;
	routeSource?: string;
	useDelayedPostgresBackupRead?: boolean;
}): Promise<FullSubject | undefined> {
	const { rows: subjectRows, source } = await runRoutedHydration({
		ctx,
		customerId,
		entityId,
		inStatuses,
		allowMissingEntity,
		readFrom,
		routeSource,
		useDelayedPostgresBackupRead,
	});
	if (!subjectRows.length) return undefined;

	const fullSubject = resultToFullSubject({
		row: subjectRows[0],
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});

	if (ctx.subjectReadTrace) ctx.subjectReadTrace.source = source;

	if (source === "replica") {
		// Pure read: replica-sourced subjects serve unreset balances and never
		// trigger primary writes; the brand keeps them out of the Redis cache.
		markReplicaSourced(fullSubject);
		return fullSubject;
	}

	await lazyResetSubjectEntitlements({ ctx, fullSubject });
	await lazyResetSubjectUsageWindows({ ctx, fullSubject });
	await checkPendingMigrationsForCustomer({
		ctx,
		fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
	});
	return fullSubject;
}

/** Fetch full subject from DB, run lazy resets by default, return normalized + fullSubject.
 *  Both normalized and fullSubject are kept in sync after reset. */
export async function getFullSubjectNormalized({
	ctx,
	customerId,
	entityId,
	inStatuses = RELEVANT_STATUSES,
	allowMissingEntity = false,
	runLazyResets = true,
	readFrom = "primary",
	routeSource,
	useDelayedPostgresBackupRead = false,
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	runLazyResets?: boolean;
	readFrom?: SubjectReadFrom;
	routeSource?: string;
	useDelayedPostgresBackupRead?: boolean;
}): Promise<
	{ normalized: NormalizedFullSubject; fullSubject: FullSubject } | undefined
> {
	const { rows: subjectRows, source } = await runRoutedHydration({
		ctx,
		customerId,
		entityId,
		inStatuses,
		allowMissingEntity,
		readFrom,
		routeSource,
		useDelayedPostgresBackupRead,
	});
	if (!subjectRows.length) return undefined;

	const normalized = subjectQueryRowToNormalized({
		row: subjectRows[0],
		entityIdRequested: !!entityId,
		allowMissingEntity,
	});

	const fullSubject = normalizedToFullSubject({ normalized });

	if (ctx.subjectReadTrace) ctx.subjectReadTrace.source = source;

	if (source === "replica") {
		// Pure read: replica-sourced subjects serve unreset balances and never
		// trigger primary writes; the brand keeps them out of the Redis cache.
		markReplicaSourced(normalized);
		markReplicaSourced(fullSubject);
	} else if (runLazyResets) {
		await lazyResetSubjectEntitlements({ ctx, fullSubject, normalized });
		await lazyResetSubjectUsageWindows({ ctx, fullSubject, normalized });
		await checkPendingMigrationsForCustomer({
			ctx,
			fullCustomer: fullSubjectToFullCustomer({ fullSubject }),
		});
	}

	return { normalized, fullSubject };
}
