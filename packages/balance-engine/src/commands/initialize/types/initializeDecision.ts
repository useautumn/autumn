import type { SubjectState } from "../../../models/subjectState.js";

export type InitializationDecision =
	| { kind: "initialized" | "duplicate"; state: SubjectState }
	| { kind: "already_initialized" };
