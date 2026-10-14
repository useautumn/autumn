import type { SubjectState } from "@autumn/balance-engine";

export type ResidentDrop = { evicted: number; kept: number; resident: number };

export type OnSubjectEvicted = (params: { customerKey: string }) => void;

export type SubjectMap = {
	readState(params: { subjectKey: string }): SubjectState | null;
	setState(params: {
		subjectKey: string;
		customerKey: string;
		state: SubjectState;
		baselineAt?: number;
	}): void;
	readBaselineAt(params: { subjectKey: string }): number | null;
	readBytes(params: { subjectKey: string }): number;
	pin(params: { subjectKey: string }): void;
	unpin(params: { subjectKey: string }): void;
	evictCustomer(params: { customerKey: string }): void;
	hideCustomer(params: { customerKey: string }): void;
	isEvicting(params: { customerKey: string }): boolean;
	dropResident(params: {
		drops: (subject: { customerKey: string; idleMs: number }) => boolean;
	}): ResidentDrop;
	clear(): void;
	sizeBytes(): number;
	bytesOf(params: { subjectKey: string }): number | null;
};
