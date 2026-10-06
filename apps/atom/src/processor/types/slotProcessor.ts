import type { AutumnLogger } from "@autumn/logging";
import type { CatalogStore } from "../../state/types/catalogStore.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import type { CheckRequest } from "./check.js";

export type SlotProcessorContext = {
	sqliteStore: SqliteStore;
	catalogStore: Pick<CatalogStore, "read">;
	logger: AutumnLogger;
};

/** Everything one slot does: decide checks, and take in the subjects Autumn sends. Answered here, or on the thread that owns the slot. */
export type SlotProcessor = {
	/** The API's check response at the caller's version, as the JSON body it is sent as; rejects with CannotAnswerError for a check the API must answer. */
	check(params: { request: CheckRequest }): Promise<string>;
	/** False when the subject was read before the one held, and so ignored. */
	setSubject(params: { subject: StoredSubject }): Promise<boolean>;
};
