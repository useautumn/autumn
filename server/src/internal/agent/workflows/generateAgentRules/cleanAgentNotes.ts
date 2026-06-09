import { generateText } from "ai";
import { anthropicClient } from "@/external/ai/initAi.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const stripMarkdownFence = ({ text }: { text: string }) =>
	text
		.trim()
		.replace(/^```(?:md|markdown)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();

const buildPrompt = ({ notes }: { notes: string }) => `
You format org-specific instructions for an Autumn billing and entitlements agent.

The user may have typed rough thoughts, fragments, or spitballs about how the agent should behave for this organization.

Rules:
- Keep only instructions that affect agent behavior.
- Be super concise.
- Use markdown bullets, one line per bullet.
- Preserve concrete IDs, feature names, product names, and policy terms.
- Do not add policies, assumptions, or explanations.
- Return an empty string if there is nothing actionable.
- Return only the cleaned notes.

<notes>
${notes}
</notes>
`.trim();

export const cleanAgentNotes = async ({
	ctx,
	notes,
}: {
	ctx: AutumnContext;
	notes: string;
}) => {
	const trimmedNotes = notes.trim();
	if (!trimmedNotes || !anthropicClient) return trimmedNotes;

	try {
		const result = await generateText({
			model: anthropicClient("claude-opus-4-6"),
			prompt: buildPrompt({ notes: trimmedNotes }),
		});

		return stripMarkdownFence({ text: result.text });
	} catch (error) {
		ctx.logger.warn(
			{
				data2: {
					error: error instanceof Error ? error.message : String(error),
				},
			},
			"[AgentRules] Failed to clean notes",
		);

		return trimmedNotes;
	}
};
