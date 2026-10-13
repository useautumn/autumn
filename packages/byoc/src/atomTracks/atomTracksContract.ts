import type { TrackCommand } from "@autumn/balance-engine";
import { z } from "zod/v4";
import { AtomSubjectReadErrorCode } from "../subjects/atomSubjectReadContract.js";

/** Where an Atom hands Autumn the deductions it granted, proving itself by its token hash as `subjects.read` does. */
export const ATOM_TRACKS_APPEND_PATH = "/atom/tracks.append";

/** The worker's command exactly as the Atom journaled it; the engine's own parser reads it where it runs. */
const trackCommandOnWire = z.custom<TrackCommand>(
	(value) => typeof value === "object" && value !== null,
);

/** `seq` is the Atom's per-customer journal number, so Autumn can say "seen up to #N from you". */
export const AtomTracksAppendRequestSchema = z.object({
	tracks: z.array(
		z.object({
			seq: z.number().int().positive(),
			command: trackCommandOnWire,
		}),
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
