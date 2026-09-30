import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { StoredSubject } from "../../state/types/storedSubject.js";
import type { CheckReply, CheckRequest } from "./check.js";

export type SlotProcessorContext = { sqliteStore: SqliteStore };

/** Everything one slot does: decide checks, and take in the subjects Autumn sends. */
export type SlotProcessor = {
	check(params: { request: CheckRequest }): CheckReply;
	setSubject(params: { subject: StoredSubject }): void;
};
