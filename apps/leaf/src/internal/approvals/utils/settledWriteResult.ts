import { type ChatApprovalWrite, ms } from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { chatApprovalWritesRepo } from "../repos/chatApprovalWritesRepo.js";

const SETTLED_WINDOW_MS = ms.minutes(15);

const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, node) =>
		node && typeof node === "object" && !Array.isArray(node)
			? Object.fromEntries(
					Object.entries(node as Record<string, unknown>).sort(([a], [b]) =>
						a.localeCompare(b),
					),
				)
			: node,
	);

const toToolResult = ({ result, status }: ChatApprovalWrite): unknown => {
	if (status === "applied") return result ?? {};
	const message = (result as { message?: string } | null)?.message;
	return {
		content: [
			{
				text: message ?? `Write was not applied (${status}).`,
				type: "text",
			},
		],
		isError: true,
	};
};

/** Approved writes run through the deterministic executor before the session
 * resumes — a resumed park gets its stored outcome instead of a second run. */
export const settledWriteResult = async ({
	input,
	sessionId,
	toolName,
}: {
	input: Record<string, unknown>;
	sessionId: string;
	toolName: string;
}): Promise<unknown | undefined> => {
	const settled = await chatApprovalWritesRepo.listSettledForSession({
		db,
		sessionId,
		since: Date.now() - SETTLED_WINDOW_MS,
		toolName,
	});
	const wanted = canonical(input);
	const match = settled.find((write) => canonical(write.tool_args) === wanted);
	return match && toToolResult(match);
};
