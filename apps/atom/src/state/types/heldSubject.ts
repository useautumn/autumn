import type { SubjectRow } from "./storedSubject.js";

export type HeldSubject = {
	subject: SubjectRow;
	bytes: number;
	sliceHash: string;
};
