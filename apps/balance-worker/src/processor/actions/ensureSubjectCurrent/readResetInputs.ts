import {
	fullSubjectToPlansNeedingBillingCycleAnchor,
	fullSubjectToPoolsSummingContributions,
	type ResetCommand,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import type { TriggeringCommand } from "./advanceResets.js";

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

const readPooledGranted = async ({
	scope,
	command,
	fullSubject,
}: ReadScope & { fullSubject: WorkerFullSubject }) => {
	const pooledBalanceIds = fullSubjectToPoolsSummingContributions({
		fullSubject,
		asOf: command.occurredAt,
	});
	if (pooledBalanceIds.length === 0) return undefined;
	return scope.ctx.db.sumPooledContributionGrants({
		pooledBalanceIds,
		dueBy: command.occurredAt,
	});
};

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
		readPooledGranted({ scope, command, fullSubject }),
	]);
	return {
		...(billingCycleAnchors && { billingCycleAnchors }),
		...(pooledGranted && { pooledGranted }),
	};
};
