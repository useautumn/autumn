import { type ApiVersion, ApiVersionClass } from "@autumn/shared";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../processor/types/check.js";
import type { CheckRequestOnWire, OwnerReply } from "./types/ownerCall.js";

/** One instance per version on the owner: building one sorts the version registry. */
const apiVersions = new Map<ApiVersion, ApiVersionClass>();

const apiVersionOf = (version: ApiVersion): ApiVersionClass => {
	const held = apiVersions.get(version);
	if (held) return held;
	const apiVersion = new ApiVersionClass(version);
	apiVersions.set(version, apiVersion);
	return apiVersion;
};

export const checkRequestToWire = ({
	request,
}: {
	request: CheckRequest;
}): CheckRequestOnWire => ({
	...request,
	apiVersion: request.apiVersion?.value ?? null,
});

export const wireToCheckRequest = ({
	request,
}: {
	request: CheckRequestOnWire;
}): CheckRequest => ({
	...request,
	apiVersion: request.apiVersion ? apiVersionOf(request.apiVersion) : null,
});

export const errorToReply = ({
	id,
	error,
}: {
	id: number;
	error: unknown;
}): OwnerReply => ({
	id,
	ok: false,
	cannotAnswer: error instanceof CannotAnswerError ? error.reason : null,
	invalid: error instanceof InvalidPushError,
	message: error instanceof Error ? error.message : String(error),
});

/** The owner's failure, thrown again on the caller's thread: a check it cannot answer is still forwarded, a bad push still refused. */
export const replyToError = ({
	cannotAnswer,
	invalid,
	message,
}: {
	cannotAnswer: ForwardReason | null;
	invalid: boolean;
	message: string;
}): Error => {
	if (cannotAnswer) return new CannotAnswerError({ reason: cannotAnswer });
	if (invalid) return new InvalidPushError(message);
	return new Error(message);
};
