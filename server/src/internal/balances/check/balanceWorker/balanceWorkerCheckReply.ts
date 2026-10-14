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
	isDeductingCheck?: boolean;
	withPreview?: boolean;
}): Promise<CheckResponseWithPreview> {
	const { result, state, catalog } = answer;
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
