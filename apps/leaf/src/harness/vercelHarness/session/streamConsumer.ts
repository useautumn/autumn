import type { Span } from "braintrust";
import type { PreviewCapture } from "../../../agent/tools/toolPolicy.js";
import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";
import type { SessionTurnUsage } from "../../common/types.js";

// Only the parts of an AI SDK stream result we consume — decoupled from the
// adapter's concrete tool generics so any harness stream is assignable.
type HarnessStreamResult = {
	fullStream: AsyncIterable<unknown>;
	usage: PromiseLike<unknown>;
};

export type ObservedApproval = {
	approvalId?: string;
	input: Record<string, unknown>;
	toolCallId: string;
	toolName: string;
};

export type ConsumedTurn = {
	approvals: ObservedApproval[];
	errorMessage?: string;
	textParts: string[];
	toolResults: Array<{ id: string; name: string; output: unknown }>;
	usage: SessionTurnUsage;
};

const emptyUsage = (): SessionTurnUsage => ({
	cacheCreationInputTokens: 0,
	cacheReadInputTokens: 0,
	inputTokens: 0,
	outputTokens: 0,
});

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/**
 * Drains an AI SDK harness stream into the shared turn shape, feeding tool
 * calls/results to the preview capture and collecting any approval requests.
 * Field access is defensive: the harness packages are canary and their part
 * union is broad.
 */
export const consumeHarnessStream = async ({
	onAutumnTool,
	previewCapture,
	result,
	span,
}: {
	onAutumnTool?: (name: string) => Promise<void> | void;
	previewCapture: PreviewCapture;
	result: HarnessStreamResult;
	/** Braintrust task span — each tool call is logged as a child span under it. */
	span?: Span;
}): Promise<ConsumedTurn> => {
	const turn: ConsumedTurn = {
		approvals: [],
		textParts: [],
		toolResults: [],
		usage: emptyUsage(),
	};
	let textBuffer = "";
	const openToolSpans = new Map<string, Span>();

	for await (const rawPart of result.fullStream) {
		const part = rawPart as Record<string, unknown> & { type: string };
		switch (part.type) {
			case "text-delta":
			case "text": {
				if (typeof part.text === "string") textBuffer += part.text;
				break;
			}
			case "tool-call": {
				const name = String(part.toolName ?? "");
				const input = asRecord(part.input);
				previewCapture.onToolCall({ input, name });
				await onAutumnTool?.(name);
				if (span) {
					openToolSpans.set(
						String(part.toolCallId ?? name),
						span.startSpan({
							event: { input },
							name: normalizeToolName(name),
							type: "tool",
						}),
					);
				}
				break;
			}
			case "tool-result": {
				const name = String(part.toolName ?? "");
				const output = "output" in part ? part.output : part.result;
				previewCapture.onToolResult({ name, output });
				turn.toolResults.push({
					id: String(part.toolCallId ?? ""),
					name: normalizeToolName(name),
					output,
				});
				const toolSpan = openToolSpans.get(String(part.toolCallId ?? name));
				if (toolSpan) {
					toolSpan.log({ output });
					toolSpan.end();
					openToolSpans.delete(String(part.toolCallId ?? name));
				}
				break;
			}
			case "tool-approval-request": {
				const toolCall = asRecord(part.toolCall);
				turn.approvals.push({
					approvalId:
						typeof part.approvalId === "string" ? part.approvalId : undefined,
					input: asRecord(toolCall.input ?? part.input),
					toolCallId: String(toolCall.toolCallId ?? part.toolCallId ?? ""),
					toolName: String(toolCall.toolName ?? part.toolName ?? "unknown"),
				});
				break;
			}
			case "error": {
				turn.errorMessage = String(asRecord(part).error ?? "Stream error");
				break;
			}
			default:
				break;
		}
	}

	// A suspended write opens a tool span with no result yet — close them so the
	// trace doesn't dangle (the result lands on the resume turn's span).
	for (const toolSpan of openToolSpans.values()) toolSpan.end();

	if (textBuffer.trim()) turn.textParts.push(textBuffer);

	const usage = asRecord(await result.usage);
	turn.usage = {
		cacheCreationInputTokens: Number(usage.cachedInputTokens ?? 0),
		cacheReadInputTokens: Number(usage.cachedInputTokens ?? 0),
		inputTokens: Number(usage.inputTokens ?? 0),
		outputTokens: Number(usage.outputTokens ?? 0),
	};
	return turn;
};
