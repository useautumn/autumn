import type { CatalogRow } from "@autumn/balance-engine";
import type { SlotProcessor } from "../../processor/types/slotProcessor.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import type { SqliteStore } from "../../state/types/sqliteStore.js";

export type SubjectKey = { customerId: string; entityId: string };

export type SinceRequest = {
	slot: number;
	after: number | null;
	cursor: SubjectCursor | null;
	limit: number;
};

export type CatalogRows = { rows: CatalogRow[]; readAt: number };

export type SubjectSource = {
	since(params: {
		slot: number;
		slotCount: number;
		after: number | null;
		window: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<{ after: number | null; subjects: AppliedSubject[] }>;
	digest(params: {
		slot: number;
		slotCount: number;
		after: number | null;
		window: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<{ after: number | null; digests: SubjectDigest[] }>;
	fetch(params: {
		slot: number;
		slotCount: number;
		keys: SubjectKey[];
	}): Promise<AppliedSubject[]>;
	catalog(params: { readAtAfter: number }): Promise<CatalogRows | null>;
};

export type Slots = {
	atomId: string | null;
	slotCount: number;
	processorFor(params: { customerId: string }): SlotProcessor;
	setCatalog(params: CatalogRows): Promise<boolean>;
	installCatalog(params: CatalogRows): boolean;
	catalogSince(params: { readAtAfter: number }): CatalogRows | null;
	listSince(params: SinceRequest): Promise<AppliedSubject[]>;
	digestSince(params: SinceRequest): Promise<SubjectDigest[]>;
	fetchSubjects(params: {
		slot: number;
		keys: SubjectKey[];
	}): Promise<AppliedSubject[]>;
	maxAppliedAt(): number;
	ownedStores(): SqliteStore[];
	catchUp(params: {
		source: SubjectSource;
		window: number | null;
	}): Promise<{ slots: number; written: number }>;
	close(): void;
};
