import type { WithheldWrite } from "../../agentRuntime/eve/parkedInput.js";

export const APPROVAL_DESCRIPTION_KEY = "approval_description";

/** Models routinely emit the two characters `\n` inside a JSON string field
 * rather than a real newline, which renders as literal "\n-" in the thread. */
const withRealNewlines = (text: string) =>
	text.replace(/\\r\\n|\\n|\\r/g, "\n");

export const approvalDescriptionFromWrites = ({
	writes,
}: {
	writes: ReadonlyArray<WithheldWrite>;
}): string | null => {
	const description = writes
		.map((write) => write.input?.[APPROVAL_DESCRIPTION_KEY])
		.find((summary): summary is string =>
			Boolean(typeof summary === "string" && summary.trim()),
		);
	return description ? withRealNewlines(description).trim() : null;
};

export const withoutApprovalDescription = (
	input: Record<string, unknown>,
): Record<string, unknown> => {
	const { [APPROVAL_DESCRIPTION_KEY]: _summary, ...request } = input;
	return request;
};
