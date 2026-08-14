import type { CatalogPlanPreview } from "@autumn/shared";
import type { RunStopReason } from "../../runs/runRegistry.js";

export type AgentApprovalRequest = Readonly<{
	preview: unknown;
	toolArgs: Readonly<Record<string, unknown>>;
	toolCallId?: string;
	toolName: string;
}>;

export type AgentQuestion = Readonly<{
	options: ReadonlyArray<Readonly<{ id?: string; label?: string }>>;
	prompt: string;
	requestId: string;
}>;

type AgentTurnBase = Readonly<{ sessionId: string }>;

export type AgentTurnResult = AgentTurnBase &
	(
		| Readonly<{ kind: "reply"; text: string }>
		| Readonly<{
				approval: AgentApprovalRequest;
				kind: "approval";
				text: string;
		  }>
		| Readonly<{ kind: "question"; question: AgentQuestion; text: string }>
		| Readonly<{
				kind: "catalog_decision";
				plan: CatalogPlanPreview;
				text: string;
		  }>
		| Readonly<{ kind: "stopped"; reason: RunStopReason; text: string }>
		| Readonly<{ kind: "empty" }>
	);

export type AgentApprovalTurn = Extract<AgentTurnResult, { kind: "approval" }>;
