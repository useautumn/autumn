import type { ApiVersionClass, TrackParams } from "@autumn/shared";
import type { AnswerableCheck } from "./check.js";

/** A track as the caller sent it to Autumn's own API, read where it entered. */
export type TrackRequest = {
	requestId: string;
	occurredAt: number;
	/** The body's idempotency_key, the key the API's track claims; null when it sent none. */
	idempotencyKey: string | null;
	params: TrackParams;
	apiVersion: ApiVersionClass;
};

/** A track Atom deducts itself: one feature of one customer, queued, by a positive value. */
export type AnswerableTrack = Pick<
	AnswerableCheck,
	"requestId" | "occurredAt" | "customerId" | "featureId" | "properties"
> & {
	value: number;
	idempotencyKey: string | null;
	skipEvent: boolean;
};
