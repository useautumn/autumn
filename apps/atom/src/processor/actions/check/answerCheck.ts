import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
} from "@autumn/balance-engine";
import { checkResultToApiResponse } from "@autumn/balance-engine/api-renderer";
import {
	AffectedResource,
	ApiVersionClass,
	AppEnv,
	applyRequestVersionChanges,
	findFeatureById,
	LATEST_VERSION,
	type SharedContext,
} from "@autumn/shared";
import { z } from "zod/v4";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import { timeStage } from "../../../threads/stats/stageClock.js";
import type { AnswerableCheck, CheckDecided } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

const appEnvSchema = z.enum(AppEnv);

/** The engine's check command. A feature Atom has never been sent may still exist, so the API answers for it. */
export const checkToCommand = ({
	check,
	subject,
}: {
	check: Pick<
		AnswerableCheck,
		"requestId" | "occurredAt" | "featureId" | "requiredBalance" | "properties"
	>;
	subject: CurrentSubject;
}): CheckCommand => {
	const feature = findFeatureById({
		features: subject.features,
		featureId: check.featureId,
	});
	if (!feature) throw new CannotAnswerError({ reason: "feature_not_stored" });
	return {
		schemaVersion: 1,
		type: "check",
		requestId: check.requestId,
		identity: subject.fullSubject.identity,
		occurredAt: check.occurredAt,
		org: subject.org,
		featureId: check.featureId,
		internalFeatureId: feature.internal_id,
		requiredBalance: check.requiredBalance,
		properties: check.properties,
	};
};

/** What the API's renderer reads, built from the subject: Atom has no request context of the API's kind. */
const toRenderContext = ({
	ctx,
	check,
	subject,
}: {
	ctx: SlotProcessorContext;
	check: AnswerableCheck;
	subject: CurrentSubject;
}): SharedContext => {
	const renderContext: SharedContext = {
		org: subject.org,
		env: appEnvSchema.parse(subject.fullSubject.identity.env),
		features: subject.features,
		logger: ctx.logger,
		expand: [],
	};
	// An older caller's query is brought up to the latest form first, as the API does.
	const query = applyRequestVersionChanges({
		input: check.query,
		fromVersion: check.apiVersion,
		toVersion: new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.Check,
		ctx: renderContext,
	});
	return { ...renderContext, expand: query.expand ?? [] };
};

/** A decision as the API's check response, on the subject it reports. */
export const renderCheck = ({
	ctx,
	check,
	command,
	result,
	subject,
	isDeductingCheck = false,
}: {
	ctx: SlotProcessorContext;
	check: AnswerableCheck;
	command: CheckCommand;
	result: CheckResult;
	subject: CurrentSubject;
	isDeductingCheck?: boolean;
}): CheckDecided => {
	const { response } = timeStage("viewRender", () =>
		checkResultToApiResponse({
			ctx: toRenderContext({ ctx, check, subject }),
			apiVersion: check.apiVersion,
			command,
			result,
			fullSubject: subject.fullSubject,
			isDeductingCheck,
		}),
	);
	return { response, result };
};

/** The engine's own check on the subject, as the API's check response: the same decision, renderer and version changes the API uses. */
export const answerCheck = ({
	ctx,
	check,
	subject,
}: {
	ctx: SlotProcessorContext;
	check: AnswerableCheck;
	subject: CurrentSubject;
}): CheckDecided => {
	const command = checkToCommand({ check, subject });
	const result = timeStage("engineStep", () =>
		computeCheck({ fullSubject: subject.fullSubject, command }),
	);
	return renderCheck({ ctx, check, command, result, subject });
};
