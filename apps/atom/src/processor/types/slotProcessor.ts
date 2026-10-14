import type { AutumnLogger } from "@autumn/logging";
import type { CatalogStore } from "../../state/types/catalogStore.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";
import type { FolderSubjectPulls } from "../../subjectPulls/types/subjectPulls.js";
import type { CheckRequest } from "./check.js";

export type SlotProcessorContext = {
	sqliteStore: SqliteStore;
	catalogStore: Pick<CatalogStore, "read">;
	logger: AutumnLogger;
	subjectPulls: FolderSubjectPulls;
};

export type CheckAnswer = { json: string; allowed: boolean };

export type SlotProcessor = {
	check(params: { request: CheckRequest }): Promise<CheckAnswer>;
	setSubject(params: { customerId: string; body: string }): Promise<boolean>;
	deleteSubject(params: { customerId: string; body: string }): Promise<boolean>;
};
