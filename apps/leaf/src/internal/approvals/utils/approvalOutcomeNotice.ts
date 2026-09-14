import type { ChatApprovalWrite } from "@autumn/shared";
import type { ApprovalRunResult } from "../types.js";
import { withoutApprovalDescription } from "./approvalDescription.js";

type WriteRow = Pick<
	ChatApprovalWrite,
	"result" | "status" | "tool_args" | "tool_name"
>;

const MAX_JSON_CHARS = 600;

const compact = (value: unknown) => {
	const json = JSON.stringify(value ?? null);
	return json.length > MAX_JSON_CHARS
		? `${json.slice(0, MAX_JSON_CHARS - 1)}…`
		: json;
};

const requestOf = (write: WriteRow) => {
	const args = withoutApprovalDescription(write.tool_args);
	return args.request && typeof args.request === "object" ? args.request : args;
};

const errorMessageOf = (result: unknown) => {
	const message = (result as { message?: unknown } | null)?.message;
	return typeof message === "string" ? message : compact(result);
};

const writeLine = (write: WriteRow, index: number) => {
	const head = `${index + 1}. ${write.tool_name} ${compact(requestOf(write))} → `;
	switch (write.status) {
		case "applied":
			return `${head}applied: ${compact(write.result)}`;
		case "failed":
			return `${head}FAILED: ${errorMessageOf(write.result)}`;
		case "unknown":
			return `${head}OUTCOME UNKNOWN (the call may or may not have reached the server; never re-run it blindly): ${errorMessageOf(write.result)}`;
		// A write still marked running when the run is being narrated was
		// interrupted mid-call: the request may have reached the server.
		case "running":
			return `${head}OUTCOME UNKNOWN (the call was interrupted and may have reached the server; never re-run it blindly)`;
		case "skipped":
			return `${head}skipped because an earlier write failed`;
		case "pending":
			return `${head}did not run`;
		default:
			return `${head}${write.status satisfies never}`;
	}
};

/**
 * What the model is told once the user has decided a card. Every write on the
 * card is listed with its own outcome — the model previously saw only the
 * primary write's response, so it reported a grouped sibling as still pending
 * — and a failed execution is named as such, never as "applied".
 */
export const approvalOutcomeNotice = ({
	outcome,
	writes,
}: {
	outcome: ApprovalRunResult;
	writes: ReadonlyArray<WriteRow>;
}): string | undefined => {
	if ("drifted" in outcome) return undefined;
	const lines = writes.map(writeLine);
	if ("error" in outcome) {
		return [
			"<approval_failed>",
			"The user approved the change you proposed, but executing it FAILED. Do NOT tell the user it was applied.",
			`Error: ${outcome.message}`,
			...(lines.length ? ["Per write:", ...lines] : []),
			'Only writes marked "applied" took effect; a write marked OUTCOME UNKNOWN may have. Tell the user the action failed and quote the error. ' +
				"If the error is in the request, fix it, preview again and re-issue the write; otherwise say what is needed and stop.",
			"</approval_failed>",
		].join("\n");
	}
	return [
		"<approval_applied>",
		"The change you proposed was approved and every write on the card was applied. Per write:",
		...(lines.length
			? lines
			: [
					`1. ${outcome.toolName ?? "write"} → applied: ${compact(outcome.result)}`,
				]),
		"Reply per the billing skill's completion response, covering every write above, " +
			"then carry out any remaining steps of the original request. Do not call these writes again.",
		"</approval_applied>",
	].join("\n");
};
