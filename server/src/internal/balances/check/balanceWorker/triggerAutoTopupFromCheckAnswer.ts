import type { CheckCommand } from "@autumn/balance-engine";
import { findFeatureById } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { triggerAutoTopUp } from "../../autoTopUp/triggerAutoTopUp.js";
import { workerReplyToFullSubject } from "../../balanceWorker/workerStateToApiBalance.js";
import type { WorkerCheckAnswer } from "./runDeductingCheck.js";

/** A plain check writes no log record, so the server decides the top-up from the reply's rows, as the legacy check does. */
export function triggerAutoTopupFromCheckAnswer({
	ctx,
	command,
	answer,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	answer: WorkerCheckAnswer;
}): void {
	const { result, state, catalog } = answer;
	if (!state || !catalog || result.fundingFeatureId === null) return;

	const fullSubject = workerReplyToFullSubject({
		state,
		catalog,
		entityId: command.identity.entityId,
	});
	const feature = findFeatureById({
		features: ctx.features,
		featureId: result.fundingFeatureId,
		errorOnNotFound: true,
	});
	triggerAutoTopUp({
		ctx,
		fullSubject,
		feature,
		now: command.occurredAt,
	}).catch((error) => {
		ctx.logger.error(
			`[runBalanceWorkerCheck] Failed to trigger auto top-up: ${error}`,
		);
	});
}
