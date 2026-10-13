import {
	type CheckCommand,
	type CheckResult,
	computeCheck,
	type TrackCommand,
} from "@autumn/balance-engine";
import { checkResultToApiResponse } from "@autumn/balance-engine/api-renderer";
import {
	AffectedResource,
	ApiVersionClass,
	AppEnv,
	applyRequestVersionChanges,
	type CheckResponseV3,
	type Feature,
	FeatureType,
	findFeatureById,
	LATEST_VERSION,
	type SharedContext,
} from "@autumn/shared";
import { z } from "zod/v4";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import type { Journal } from "../../../state/journal/types/journal.js";
import type { AnswerableCheck } from "../../types/check.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { readCurrentSubject } from "../readCurrentSubject/readCurrentSubject.js";

const appEnvSchema = z.enum(AppEnv);

/** As long as the API holds a track's body key, so a command sent again inside it is applied once. */
const TRACK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** A feature Atom has never been sent may still exist, so the API answers for it. */
const featureOf = ({
	check,
	subject,
}: {
	check: AnswerableCheck;
	subject: CurrentSubject;
}): Feature => {
	const feature = findFeatureById({
		features: subject.features,
		featureId: check.featureId,
	});
	if (!feature) throw new CannotAnswerError({ reason: "feature_not_stored" });
	return feature;
};

/** What the engine's check and track commands share, read from the check and the subject it is decided on. */
const commandBaseOf = ({
	check,
	subject,
	feature,
}: {
	check: AnswerableCheck;
	subject: CurrentSubject;
	feature: Feature;
}) => ({
	schemaVersion: 1 as const,
	requestId: check.requestId,
	identity: subject.fullSubject.identity,
	occurredAt: check.occurredAt,
	org: subject.org,
	featureId: check.featureId,
	internalFeatureId: feature.internal_id,
	properties: check.properties,
});

/** The engine's check command. */
const checkToCommand = ({
	check,
	subject,
}: {
	check: AnswerableCheck;
	subject: CurrentSubject;
}): CheckCommand => ({
	...commandBaseOf({ check, subject, feature: featureOf({ check, subject }) }),
	type: "check",
	requiredBalance: check.requiredBalance,
});

/**
 * The balance worker's own track for a deduction Atom granted, as the API builds a deducting check's: `overflow`, since
 * the units are already given. A flag is never usage-tracked, so the API refuses its send_event.
 */
const trackToCommand = ({
	check,
	subject,
	skipEvent,
}: {
	check: AnswerableCheck;
	subject: CurrentSubject;
	skipEvent: boolean;
}): TrackCommand => {
	const feature = featureOf({ check, subject });
	if (feature.type === FeatureType.Boolean)
		throw new CannotAnswerError({ reason: "send_event" });
	return {
		...commandBaseOf({ check, subject, feature }),
		type: "track",
		commandId: check.requestId,
		value: check.requiredBalance,
		overageBehavior: "overflow",
		enforceOverdueBlock: true,
		usageEvent: skipEvent
			? null
			: { name: check.featureId, idempotencyKey: null, id: null },
		idempotency: {
			key: `track:${check.requestId}`,
			ttlMs: TRACK_IDEMPOTENCY_TTL_MS,
		},
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

/** The same renderer and version changes the API uses, on the subject the answer reports. */
const renderCheck = ({
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
}): CheckResponseV3 =>
	checkResultToApiResponse({
		ctx: toRenderContext({ ctx, check, subject }),
		apiVersion: check.apiVersion,
		command,
		result,
		fullSubject: subject.fullSubject,
		isDeductingCheck,
	}).response;

/** The engine's own check on the subject, as the API's check response. */
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
	return renderCheck({ ctx, check, command, result, subject });
};

/**
 * A send_event check decided by the engine's own check and, when allowed, owed to Autumn as the worker's track. The
 * caller hears only once the deduction is on disk; one that could not be written is left to the API to deduct.
 */
export const answerDeductingCheck = async ({
	ctx,
	journal,
	check,
	skipEvent,
	subject,
}: {
	ctx: SlotProcessorContext;
	journal: Journal;
	check: AnswerableCheck;
	skipEvent: boolean;
	subject: CurrentSubject;
}): Promise<CheckResponseV3> => {
	const command = checkToCommand({ check, subject });
	const track = trackToCommand({ check, subject, skipEvent });
	const result = computeCheck({ fullSubject: subject.fullSubject, command });
	if (!result.allowed)
		return renderCheck({
			ctx,
			check,
			command,
			result,
			subject,
			isDeductingCheck: true,
		});

	const committed = journal.append({
		customerId: check.customerId,
		command: track,
	});
	// Read before the commit lands: this deduction and those before it, not one appended while it was in flight.
	const deducted = readCurrentSubject({
		ctx,
		customerId: check.customerId,
		entityId: check.entityId,
	});
	await committed.catch(() => {
		throw new CannotAnswerError({ reason: "journal_not_written" });
	});
	return renderCheck({
		ctx,
		check,
		command,
		result,
		subject: deducted,
		isDeductingCheck: true,
	});
};
