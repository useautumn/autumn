import type { SlotProcessor } from "../../../processor/types/slotProcessor.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../../state/repos/subjectStates.js";
import type { CatalogUpdate } from "./ownerCall.js";

export type CatalogCalls = {
	setCatalog(params: CatalogUpdate): Promise<boolean>;
	installCatalog(params: CatalogUpdate): Promise<boolean>;
};

export type SlotOwners = {
	index: number;
	threads: number;
	ownerOf(params: { slot: number }): number;
	processorOn(params: { thread: number; atomId: string | null }): SlotProcessor;
	catalogOn(params: { thread: number; atomId: string | null }): CatalogCalls;
	listSinceOn(params: {
		thread: number;
		atomId: string | null;
		slot: number;
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<AppliedSubject[]>;
	digestSinceOn(params: {
		thread: number;
		atomId: string | null;
		slot: number;
		after: number | null;
		cursor: SubjectCursor | null;
		limit: number;
	}): Promise<SubjectDigest[]>;
	fetchSubjectsOn(params: {
		thread: number;
		atomId: string | null;
		slot: number;
		keys: { customerId: string; entityId: string }[];
	}): Promise<AppliedSubject[]>;
};
