import { ApiVersionClass } from "@autumn/shared";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../lib/forward/cannotAnswerError.js";
import type { CheckRequest } from "../../processor/types/check.js";
import type { CheckRequestOnWire, OwnerReply } from "./types/ownerCall.js";

/** A structured clone drops the version's class, so it crosses by name and is rebuilt on the owner. */
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
	apiVersion: request.apiVersion
		? new ApiVersionClass(request.apiVersion)
		: null,
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
