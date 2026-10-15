import type { CheckResult } from "@autumn/balance-engine";
import type { AutumnLogger } from "@autumn/logging";
import type { TrackResponseV3 } from "@autumn/shared";
import type { HandoffBarrier } from "../../replicas/handover/createHandoffBarrier.js";
import type { CustomerHandoff } from "../../replicas/handover/types/customerHandoff.js";
import type { ReplicaRing } from "../../replicas/types/replicaRing.js";
import type { Journal } from "../../state/journal/types/journal.js";
import type { OpenLocks } from "../../state/openLocks/createOpenLocks.js";
import type { CatalogStore } from "../../state/types/catalogStore.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { FolderSubjectPulls } from "../../subjectPulls/types/subjectPulls.js";
import type { CheckRequest } from "./check.js";
import type { FinalizeRequest, FinalizeResponse } from "./finalize.js";
import type { TrackRequest } from "./track.js";

export type SlotProcessorContext = {
	sqliteStore: SqliteStore;
	catalogStore: Pick<CatalogStore, "read">;
	logger: AutumnLogger;
	subjectPulls: FolderSubjectPulls;
	/** The slot's commands owed to Autumn. */
	journal: Journal;
	/** The locks this slot took: a retried lock_id is compared with its track, a finalize carries its row. */
	openLocks: OpenLocks;
	/** Holds a moved customer's first requests until the old owner's entries for it have landed on this thread. */
	barrier?: HandoffBarrier;
	/** Who owns each customer now: a request for one that moved away is refused here, so its new owner decides it. */
	ring?: Pick<ReplicaRing, "self" | "ownerOf">;
};

/** A check's response as the JSON body it is sent as, and its verdict, read before stringify for the request line. */
export type CheckAnswer = {
	json: string;
	allowed: boolean;
	/** Why the engine refused it, for the comparer reading the response's headers; null when allowed. */
	denial: Pick<CheckResult, "reason" | "limitType"> | null;
};

/** Whether a push was stored, and the entity it was for as its owner thread parsed it, so no caller parses the body again. */
export type PushedSubject = { stored: boolean; entityId: string | null };

/** Everything one slot does: decide checks, deduct tracks, and take in the subjects Autumn sends. Answered here, or on the thread that owns the slot. */
export type SlotProcessor = {
	/** The API's check response at the caller's version; rejects with CannotAnswerError for a check the API must answer. */
	check(params: { request: CheckRequest }): Promise<CheckAnswer>;
	/** The API's queued-track response; rejects with CannotAnswerError for a track the API must take. */
	track(params: { request: TrackRequest }): Promise<TrackResponseV3>;
	/** The API's finalize response; rejects with CannotAnswerError for a finalize the API must settle. */
	finalize(params: { request: FinalizeRequest }): Promise<FinalizeResponse>;
	/**
	 * A `subjects.set` body as JSON text, routed by its customer: parsed once, on the owner thread, which refuses a body
	 * for another customer with InvalidPushError. Not stored when the subject was read before the one held, and so ignored.
	 */
	setSubject(params: {
		customerId: string;
		body: string;
	}): Promise<PushedSubject>;
	/** What another replica handed over with its customers: the entries into this slot's journal, in one transaction, under their own writers; the locks into its open locks. */
	receiveHandoff(params: {
		handoffs: CustomerHandoff[];
	}): Promise<{ held: number }>;
	/** A `subjects.delete` body as JSON text, routed and refused the same way. False when a newer read is already held. */
	deleteSubject(params: { customerId: string; body: string }): Promise<boolean>;
};
