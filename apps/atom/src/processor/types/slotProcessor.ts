import type { AutumnLogger } from "@autumn/logging";
import type { CheckResponseV3 } from "@autumn/shared";
import type { CatalogStore } from "../../state/types/catalogStore.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import type { CheckRequest } from "./check.js";

export type SlotProcessorContext = {
	sqliteStore: SqliteStore;
	catalogStore: Pick<CatalogStore, "read">;
	logger: AutumnLogger;
};

/** Everything one slot does: decide checks, and take in the subjects Autumn sends. */
export type SlotProcessor = {
	/** The API's check response at the caller's version; throws CannotAnswerError for a check the API must answer. */
	check(params: { request: CheckRequest }): CheckResponseV3;
	/** False when the subject was read before the one held, and so ignored. */
	setSubject(params: { subject: StoredSubject }): boolean;
};
