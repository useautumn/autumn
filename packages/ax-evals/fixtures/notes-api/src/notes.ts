export const summarizeNote = async (
	userId: string,
	text: string,
): Promise<{ summary: string }> => {
	const words = text.trim().split(/\s+/);
	const summary =
		words.length <= 8 ? text.trim() : `${words.slice(0, 8).join(" ")}…`;
	return { summary };
};
