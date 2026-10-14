import type { SubjectDropReason } from "./subjectDropReason.js";

export type SubjectMapUsage = {
	residentSubjects: number;
	residentBytes: number;
	droppedSubjects: Record<SubjectDropReason, number>;
};
