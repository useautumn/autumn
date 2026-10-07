import type { AutumnLogger } from "@autumn/logging";
import type { CatalogStore } from "../../state/types/catalogStore.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { CheckRequest } from "./check.js";

export type SlotProcessorContext = {
	sqliteStore: SqliteStore;
	catalogStore: Pick<CatalogStore, "read">;
	logger: AutumnLogger;
};

/** A check's response as the JSON body it is sent as, and its verdict, read before stringify for the request line. */
export type CheckAnswer = { json: string; allowed: boolean };

/** Everything one slot does: decide checks, and take in the subjects Autumn sends. Answered here, or on the thread that owns the slot. */
export type SlotProcessor = {
	/** The API's check response at the caller's version; rejects with CannotAnswerError for a check the API must answer. */
	check(params: { request: CheckRequest }): Promise<CheckAnswer>;
	/**
	 * A `subjects.set` body as JSON text, routed by its customer: parsed once, on the owner thread, which refuses a body
	 * for another customer with InvalidPushError. False when the subject was read before the one held, and so ignored.
	 */
	setSubject(params: { customerId: string; body: string }): Promise<boolean>;
};
