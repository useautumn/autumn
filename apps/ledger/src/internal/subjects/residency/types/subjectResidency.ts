import type { SubjectImport } from "../../types/subjectImport.js";

export type SubjectResidency = {
	isResident: (params: { key: string }) => boolean;
	// Resolves once the subject's rows are fetched and parked; concurrent
	// callers for the same key share one Postgres read.
	loadOnce: (params: {
		key: string;
		load: () => Promise<SubjectImport>;
	}) => Promise<void>;
	takeLoaded: () => SubjectImport[];
	markResident: (params: { key: string }) => void;
};
