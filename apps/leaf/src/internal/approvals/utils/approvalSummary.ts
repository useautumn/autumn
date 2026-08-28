import type { WithheldWrite } from "../../agentRuntime/eve/parkedInput.js";

export const APPROVAL_SUMMARY_KEY = "approval_summary";

export const approvalSummaryFromWrites = ({
	writes,
}: {
	writes: ReadonlyArray<WithheldWrite>;
}): string | null =>
	writes
		.map((write) => write.input?.[APPROVAL_SUMMARY_KEY])
		.find((summary): summary is string =>
			Boolean(typeof summary === "string" && summary.trim()),
		)
		?.trim() ?? null;

export const withoutApprovalSummary = (
	input: Record<string, unknown>,
): Record<string, unknown> => {
	const { [APPROVAL_SUMMARY_KEY]: _summary, ...request } = input;
	return request;
};
