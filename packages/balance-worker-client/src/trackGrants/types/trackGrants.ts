import type {
	Catalog,
	GrantedTrackDecision,
	SubjectState,
	TrackCommand,
} from "@autumn/balance-engine";
import type { TrackReply } from "../../contracts/track.js";

export type TrackGrantsConfig = {
	/** This server task, as owners count lanes; unique per process. */
	lane: string;
	/** Most grants held at once; the least recently used goes first. */
	maxEntries: number;
	/** The longest this server answers from one grant, whatever the owner said; defaults to 1 s. */
	maxTtlMs?: number;
	/** The engine's `decideGrantedTrack`: the client holds no decision logic of its own. */
	decide: (params: {
		state: SubjectState;
		catalog: Catalog;
		command: TrackCommand;
	}) => GrantedTrackDecision | null;
};

/** Since the client started. */
export type TrackGrantCounters = {
	/** Tracks answered here inside a grant and queued for the owner. */
	grantHit: number;
	/** Grantable tracks sent to the owner. */
	grantMiss: number;
	/** Owner replies that carried a grant. */
	grantIssued: number;
	/** Grants dropped to keep within `maxEntries`, or after a failed append. */
	grantDropped: number;
	size: number;
};

export type TrackGrants = {
	/** Answered here and queued when a held grant covers it; otherwise the owner's reply, held if it carries a grant. */
	answer(params: {
		command: TrackCommand;
		send: () => Promise<TrackReply>;
		append: (command: TrackCommand) => Promise<void>;
	}): Promise<TrackReply>;
	readCounters(): TrackGrantCounters;
};
