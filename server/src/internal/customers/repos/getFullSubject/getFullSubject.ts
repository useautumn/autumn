import {
	type CusProductStatus,
	type FullSubject,
	fullSubjectToFullCustomer,
	type NormalizedFullSubject,
	normalizedToFullSubject,
	type SubjectQueryRow,
} from "@autumn/shared";
import { executePrepared } from "@/db/executePrepared.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	resolveSubjectReadDb,
	type SubjectReadFrom,
	type SubjectReadSource,
} from "@/db/resolveSubjectReadDb.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkPendingMigrationsForCustomer } from "@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js";
import { lazyResetSubjectEntitlements } from "../../actions/resetCustomerEntitlementsV2/lazyResetSubjectEntitlements.js";
import { lazyResetSubjectUsageWindows } from "../../actions/resetUsageWindows/lazyResetSubjectUsageWindows.js";
import { markReplicaSourced } from "../../cache/fullSubject/subjectProvenance.js";
import { RELEVANT_STATUSES } from "../../cusProducts/CusProductService.js";
import { shouldAggregateEntityData } from "../../cusUtils/customerEntityData.js";
import {
	isFullSubjectGateRejection,
	runWithFullSubjectGate,
} from "./getFullSubjectGate.js";
import { getFullSubjectQuery } from "./getFullSubjectQuery.js";
import {
	resultToFullSubject,
	subjectQueryRowToNormalized,
} from "./subjectQueryRowToNormalized.js";
import { unpackSubjectEnvelope } from "./unpackSubjectEnvelope.js";

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
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses: CusProductStatus[];
	allowMissingEntity: boolean;
	readFrom: SubjectReadFrom;
	routeSource?: string;
}): Promise<{ rows: SubjectQueryRow[]; source: SubjectReadSource }> => {
	const { org, env } = ctx;

	const runHydration = ({
		db,
		lane,
	}: {
		db: DrizzleCli;
		lane: SubjectReadSource;
	}) =>
		runWithFullSubjectGate({
			customerId,
			orgId: org.id,
			env,
			lane,
			logger: ctx.logger,
			queryFn: () =>
				executePrepared({
					db,
					label: "getFullSubject",
					query: getFullSubjectQuery({
						orgId: org.id,
						env,
						customerId,
						entityId,
						inStatuses,
						allowMissingEntity,
						aggregateEntityData: shouldAggregateEntityData({
							apiVersion: ctx.apiVersion,
						}),
					}),
				}),
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
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	readFrom?: SubjectReadFrom;
	routeSource?: string;
}): Promise<FullSubject | undefined> {
	const { rows: subjectRows, source } = await runRoutedHydration({
		ctx,
		customerId,
		entityId,
		inStatuses,
		allowMissingEntity,
		readFrom,
		routeSource,
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
}: {
	ctx: AutumnContext;
	customerId?: string;
	entityId?: string;
	inStatuses?: CusProductStatus[];
	allowMissingEntity?: boolean;
	runLazyResets?: boolean;
	readFrom?: SubjectReadFrom;
	routeSource?: string;
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
