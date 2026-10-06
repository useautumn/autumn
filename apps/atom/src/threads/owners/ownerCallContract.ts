import { type ApiVersion, ApiVersionClass } from "@autumn/shared";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../processor/types/check.js";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import type {
	CheckRequestOnWire,
	OwnerReply,
	StoredSubjectOnWire,
} from "./types/ownerCall.js";

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

export const storedSubjectToWire = ({
	subject,
}: {
	subject: StoredSubject;
}): StoredSubjectOnWire => ({
	...subject,
	logOffset: subject.logOffset.toString(),
});

export const wireToStoredSubject = ({
	subject,
}: {
	subject: StoredSubjectOnWire;
}): StoredSubject => ({ ...subject, logOffset: BigInt(subject.logOffset) });

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
	message: error instanceof Error ? error.message : String(error),
});

/** The owner's failure, thrown again on the caller's thread: a check it cannot answer is still forwarded. */
export const replyToError = ({
	cannotAnswer,
	message,
}: {
	cannotAnswer: ForwardReason | null;
	message: string;
}): Error =>
	cannotAnswer
		? new CannotAnswerError({ reason: cannotAnswer })
		: new Error(message);
