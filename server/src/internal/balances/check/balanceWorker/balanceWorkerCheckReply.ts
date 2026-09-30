import {
	type CheckCommand,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { checkResultToApiResponse } from "@autumn/balance-engine/api-renderer";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CheckResponseWithPreview,
	getCheckPreview,
} from "@/internal/api/check/getCheckPreview.js";
import type { WorkerCheckAnswer } from "./runDeductingCheck.js";

/** A worker's answer as the API's check response; the preview is the one part that reads Postgres, so it is added here. */
export async function checkAnswerToApiResponse({
	ctx,
	command,
	answer,
	isDeductingCheck = false,
	withPreview = false,
}: {
	ctx: AutumnContext;
	command: CheckCommand;
	answer: WorkerCheckAnswer;
	/** The check deducts (`send_event` or a lock), so it also answers with the legacy track `balances` map. */
	isDeductingCheck?: boolean;
	withPreview?: boolean;
}): Promise<CheckResponseWithPreview> {
	const { result, state, catalog } = answer;
	// The worker's reply is the customer: its rows and the catalog they were decided against.
	const fullSubject =
		state && catalog
			? subjectStateToFullSubject({
					state,
					catalog,
					entityId: command.identity.entityId,
				})
			: null;
	const { response, feature, balance } = checkResultToApiResponse({
		ctx,
		apiVersion: ctx.apiVersion,
		command,
		result,
		fullSubject,
		isDeductingCheck,
	});
	const preview = withPreview
		? await getCheckPreview({
				ctx,
				allowed: result.allowed,
				apiBalance: balance,
				feature,
				customerId: command.identity.customerId,
				entityId: command.identity.entityId ?? undefined,
			})
		: undefined;
	return { ...response, preview };
}
