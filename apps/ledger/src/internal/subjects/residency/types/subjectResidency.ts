import type { SubjectImport } from "../../types/subjectImport.js";

export type SubjectResidency = {
	isResident: (params: { key: string }) => boolean;
	// A structural write landed in Postgres: the next command re-imports before
	// it folds. Not resident until it does.
	markStale: (params: { key: string }) => void;
	// Resolves once the subject's rows are fetched and parked; concurrent
	// callers for the same key share one Postgres read.
	loadOnce: (params: {
		key: string;
		load: () => Promise<SubjectImport>;
	}) => Promise<void>;
	takeLoaded: () => SubjectImport[];
	markResident: (params: { key: string }) => void;
};
