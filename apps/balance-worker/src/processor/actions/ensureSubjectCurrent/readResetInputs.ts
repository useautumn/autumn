import {
	fullSubjectToPlansNeedingBillingCycleAnchor,
	fullSubjectToPoolsNeedingPromotion,
	type ResetCommand,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import type { TriggeringCommand } from "./advanceResets.js";

/** What a reset needs from Postgres that the subject doesn't hold: read only for the due rows that need them. */
export type ResetInputs = Pick<
	ResetCommand,
	"billingCycleAnchors" | "pooledGranted"
>;

type ReadScope = { scope: PartitionProcessorScope; command: TriggeringCommand };

const readBillingCycleAnchors = async ({
	scope,
	command,
	fullSubject,
}: ReadScope & { fullSubject: WorkerFullSubject }) => {
	const customerProductIds = fullSubjectToPlansNeedingBillingCycleAnchor({
		fullSubject,
		asOf: command.occurredAt,
	});
	if (customerProductIds.length === 0) return undefined;
	return scope.ctx.db.getBillingCycleAnchors({
		identity: command.identity,
		customerProductIds,
	});
};

/** Promotes each due pool's contributions and keeps the grants that came back; a pool with no contributions has none. */
const promotePools = async ({
	scope,
	command,
	fullSubject,
}: ReadScope & { fullSubject: WorkerFullSubject }) => {
	const pooledBalanceIds = fullSubjectToPoolsNeedingPromotion({
		fullSubject,
		asOf: command.occurredAt,
	});
	if (pooledBalanceIds.length === 0) return undefined;
	const promoted = await Promise.all(
		pooledBalanceIds.map(async (pooledBalanceId) => ({
			pooledBalanceId,
			granted: await scope.ctx.db.promoteDuePooledContributions({
				pooledBalanceId,
				now: command.occurredAt,
			}),
		})),
	);
	return Object.fromEntries(
		promoted.flatMap(({ pooledBalanceId, granted }) =>
			granted === null ? [] : [[pooledBalanceId, granted]],
		),
	);
};

/** Runs before the critical section; the common case is nothing due and no query. */
export const readResetInputs = async ({
	scope,
	command,
}: ReadScope): Promise<ResetInputs> => {
	const { identity } = command;
	const state = scope.ctx.writer.readFreshestState({ identity });
	if (!state) return {};
	const fullSubject = scope.ctx.subjectHydrator.readSubject({
		state,
		identity,
	});

	const [billingCycleAnchors, pooledGranted] = await Promise.all([
		readBillingCycleAnchors({ scope, command, fullSubject }),
		promotePools({ scope, command, fullSubject }),
	]);
	return {
		...(billingCycleAnchors && { billingCycleAnchors }),
		...(pooledGranted && { pooledGranted }),
	};
};
