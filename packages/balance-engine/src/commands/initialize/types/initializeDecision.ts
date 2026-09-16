import type { CustomerState } from "../../../models/customerState.js";

export type InitializationDecision =
	| { kind: "initialized" | "duplicate"; state: CustomerState }
	| { kind: "already_initialized" };
