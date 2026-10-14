import type { FinalizeCommand, TrackCommand } from "@autumn/balance-engine";
import { z } from "zod/v4";
import { AtomSubjectReadErrorCode } from "../subjects/atomSubjectReadContract.js";

/** Where an Atom hands Autumn the deductions it granted, proving itself by its token hash as `subjects.read` does. */
export const ATOM_TRACKS_APPEND_PATH = "/atom/tracks.append";

/** The worker's track or finalize exactly as the Atom journaled it; the engine's own parsers read it where it runs. */
const commandOnWire = z.custom<TrackCommand | FinalizeCommand>(
	(value) => typeof value === "object" && value !== null,
);

/**
 * Journaled tracks: `writerId` names the journal file, and `seq` is its per-customer number, so Autumn can say "seen up to
 * #N from that journal". A new file is a new writer; one request may carry every journal of a thread.
 */
export const AtomTracksAppendRequestSchema = z.object({
	tracks: z.array(
		z.object({
			writerId: z.string().min(1),
			seq: z.number().int().positive(),
			command: commandOnWire,
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
