import { type ApiVersion, ApiVersionClass } from "@autumn/shared";
import { AtomApiError } from "../../http/handlers/errorHandler/atomApiError.js";
import {
	type AtomError,
	atomErrorOf,
} from "../../http/handlers/errorHandler/atomErrorOf.js";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../lib/forward/cannotAnswerError.js";
import { CustomerMovedError } from "../../processor/ownership/customerMovedError.js";
import type { CheckRequest } from "../../processor/types/check.js";
import type { FinalizeRequest } from "../../processor/types/finalize.js";
import type { TrackRequest } from "../../processor/types/track.js";
import type {
	AppliedSubject,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import { OwnerUnavailableError } from "./ownerUnavailableError.js";
import type {
	AppliedSubjectOnWire,
	CheckRequestOnWire,
	FinalizeRequestOnWire,
	OwnerReply,
	SubjectDigestOnWire,
	TrackRequestOnWire,
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

export const trackRequestToWire = ({
	request,
}: {
	request: TrackRequest;
}): TrackRequestOnWire => ({
	...request,
	apiVersion: request.apiVersion.value,
});

export const wireToTrackRequest = ({
	request,
}: {
	request: TrackRequestOnWire;
}): TrackRequest => ({
	...request,
	apiVersion: apiVersionOf(request.apiVersion),
});

/** What the API would answer for this failure, when it is one the Atom answers itself rather than a 500. */
const apiErrorOf = (error: unknown): AtomError | null => {
	if (!(error instanceof Error)) return null;
	const answer = atomErrorOf({ cause: error });
	return answer.status === 500 ? null : answer;
};

export const finalizeRequestToWire = ({
	request,
}: {
	request: FinalizeRequest;
}): FinalizeRequestOnWire => ({
	...request,
	apiVersion: request.apiVersion.value,
});

export const wireToFinalizeRequest = ({
	request,
}: {
	request: FinalizeRequestOnWire;
}): FinalizeRequest => ({
	...request,
	apiVersion: apiVersionOf(request.apiVersion),
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
	movedTo: error instanceof CustomerMovedError ? error.owner : null,
	invalid: error instanceof InvalidPushError,
	unavailable: error instanceof OwnerUnavailableError,
	apiError: apiErrorOf(error),
	message: error instanceof Error ? error.message : String(error),
});

/** The owner's failure, thrown again on the caller's thread: a check it cannot answer is still forwarded, a bad push still refused. */
export const replyToError = ({
	cannotAnswer,
	movedTo,
	invalid,
	unavailable,
	apiError,
	message,
	thread,
}: {
	cannotAnswer: ForwardReason | null;
	movedTo: string | null;
	invalid: boolean;
	unavailable: boolean;
	apiError: AtomError | null;
	message: string;
	thread: number;
}): Error => {
	if (cannotAnswer) return new CannotAnswerError({ reason: cannotAnswer });
	if (movedTo) return new CustomerMovedError({ owner: movedTo });
	if (invalid) return new InvalidPushError(message);
	if (unavailable) return new OwnerUnavailableError({ thread });
	if (apiError) return new AtomApiError({ answer: apiError });
	return new Error(message);
};

export const appliedSubjectToWire = ({
	subject,
	appliedAt,
}: AppliedSubject): AppliedSubjectOnWire => ({
	subject: {
		...subject,
		logOffset: subject.logOffset.toString(),
		customerVersion: subject.customerVersion.toString(),
	},
	appliedAt,
});

export const wireToAppliedSubject = ({
	subject,
	appliedAt,
}: AppliedSubjectOnWire): AppliedSubject => ({
	subject: {
		...subject,
		logOffset: BigInt(subject.logOffset),
		customerVersion: BigInt(subject.customerVersion),
	},
	appliedAt,
});

export const digestToWire = (digest: SubjectDigest): SubjectDigestOnWire => ({
	...digest,
	logOffset: digest.logOffset.toString(),
});

export const wireToDigest = (wire: SubjectDigestOnWire): SubjectDigest => ({
	...wire,
	logOffset: BigInt(wire.logOffset),
});
