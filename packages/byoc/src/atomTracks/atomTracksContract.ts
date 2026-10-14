import type { TrackCommand } from "@autumn/balance-engine";
import { z } from "zod/v4";
import { AtomSubjectReadErrorCode } from "../subjects/atomSubjectReadContract.js";

/** Where an Atom hands Autumn the deductions it granted, proving itself by its token hash as `subjects.read` does. */
export const ATOM_TRACKS_APPEND_PATH = "/atom/tracks.append";

/** The worker's command exactly as the Atom journaled it; the engine's own parser reads it where it runs. */
const trackCommandOnWire = z.custom<TrackCommand>(
	(value) => typeof value === "object" && value !== null,
);

/** A lock the Atom settles, named as the API names it: Autumn settles its own row, never the Atom's copy. */
const atomFinalizeSchema = z.object({
	requestId: z.string().min(1),
	occurredAt: z.number().int().nonnegative(),
	customer_id: z.string().min(1),
	lock_id: z.string().min(1),
	/** The lock's entity and feature, as its track named them: the view it settles in and what a confirm above it is attributed to. */
	entity_id: z.string().min(1).nullable(),
	feature_id: z.string().min(1),
	/** 0 releases the lock, null confirms it at what it took. */
	finalValue: z.number().nullable(),
	properties: z.record(z.string(), z.unknown()).nullish(),
});

export type AtomFinalize = z.infer<typeof atomFinalizeSchema>;

/**
 * Journaled tracks and finalizes: `writerId` names the journal file, and `seq` is its per-customer number, so Autumn can say "seen up to
 * #N from that journal". A new file is a new writer; one request may carry every journal of a thread.
 */
export const AtomTracksAppendRequestSchema = z.object({
	tracks: z.array(
		z.union([
			z.object({
				writerId: z.string().min(1),
				seq: z.number().int().positive(),
				command: trackCommandOnWire,
			}),
			z.object({
				writerId: z.string().min(1),
				seq: z.number().int().positive(),
				finalize: atomFinalizeSchema,
			}),
		]),
	),
});

export type AtomTracksAppendRequest = z.infer<
	typeof AtomTracksAppendRequestSchema
>;

/**
 * 204 once Autumn durably holds every track; a resend is deduplicated by each command's own idempotency key. A 5xx means
 * Autumn could not take the batch, and the Atom sends it again whole.
 */
export const AtomTracksAppendErrorCode = {
	/** 401: no Atom holds the token hash. */
	AtomUnknown: AtomSubjectReadErrorCode.AtomUnknown,
	/** 400: the body is not a `tracks.append` request. */
	Unreadable: "unreadable",
} as const;
