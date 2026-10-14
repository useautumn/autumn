import { type CheckCommand, computeCheck } from "@autumn/balance-engine";
import { checkResultToApiResponse } from "@autumn/balance-engine/api-renderer";
import {
	AffectedResource,
	ApiVersionClass,
	AppEnv,
	applyRequestVersionChanges,
	type CheckResponseV3,
	findFeatureById,
	LATEST_VERSION,
	type SharedContext,
} from "@autumn/shared";
import { z } from "zod/v4";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { AnswerableCheck } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

const appEnvSchema = z.enum(AppEnv);

const checkToCommand = ({
	check,
	subject,
}: {
	check: AnswerableCheck;
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
	const query = applyRequestVersionChanges({
		input: check.query,
		fromVersion: check.apiVersion,
		toVersion: new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.Check,
		ctx: renderContext,
	});
	return { ...renderContext, expand: query.expand ?? [] };
};

export const answerCheck = ({
	ctx,
	check,
	subject,
}: {
	ctx: SlotProcessorContext;
	check: AnswerableCheck;
	subject: CurrentSubject;
}): CheckResponseV3 => {
	const command = checkToCommand({ check, subject });
	const result = computeCheck({ fullSubject: subject.fullSubject, command });
	const { response } = checkResultToApiResponse({
		ctx: toRenderContext({ ctx, check, subject }),
		apiVersion: check.apiVersion,
		command,
		result,
		fullSubject: subject.fullSubject,
	});
	return response;
};
