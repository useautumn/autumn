import { completeChat } from "../../llm/completeChat.ts";
import type { AxRunOutput } from "../../types/axRunOutput.ts";
import type { AxScore } from "../types/axScore.ts";
import type { Expectation } from "../types/expectation.ts";

const JUDGE_MODEL =
	process.env.AX_EVALS_JUDGE_MODEL ?? "google/gemini-2.5-flash";

export type JudgeCheck = {
	name: string;
	question: string;
};

const transcriptOf = (output: AxRunOutput): string => {
	const lines: string[] = [];
	const turnCount = Math.max(output.userTexts.length, output.turnTexts.length);
	for (let turn = 0; turn < turnCount; turn++) {
		const userText = output.userTexts[turn];
		if (userText) lines.push(`USER: ${userText}`);
		for (const tool of output.toolUses.filter((t) => t.turn === turn)) {
			lines.push(`AGENT TOOL: ${tool.name} ${JSON.stringify(tool.input)}`);
		}
		const agentText = output.turnTexts[turn];
		if (agentText) lines.push(`AGENT: ${agentText}`);
	}
	return lines.join("\n");
};

const judgePrompt = ({
	transcript,
	checks,
}: {
	transcript: string;
	checks: JudgeCheck[];
}): string => `You are grading a conversation between a USER (a customer setting up billing) and an AGENT (an AI coding agent). The transcript includes the agent's tool calls.

Answer each question with true or false, based only on the transcript. Be literal: "asked about X" means the agent posed a question to the user about X, not that X merely came up.

Questions:
${checks.map((check, index) => `${index + 1}. [${check.name}] ${check.question}`).join("\n")}

Transcript:
---
${transcript}
---`;

const judgeVerdicts = async ({
	output,
	checks,
}: {
	output: AxRunOutput;
	checks: JudgeCheck[];
}): Promise<Record<string, boolean>> => {
	const raw = await completeChat({
		model: JUDGE_MODEL,
		messages: [
			{
				role: "user",
				content: judgePrompt({ transcript: transcriptOf(output), checks }),
			},
		],
		jsonSchema: {
			name: "verdicts",
			schema: {
				type: "object",
				properties: Object.fromEntries(
					checks.map((check) => [check.name, { type: "boolean" }]),
				),
				required: checks.map((check) => check.name),
				additionalProperties: false,
			},
		},
	});
	return JSON.parse(raw) as Record<string, boolean>;
};

export const judge = {
	conversation: (checks: Record<string, string>): Expectation[] =>
		judgeConversation(
			Object.entries(checks).map(([name, question]) => ({ name, question })),
		),
};

const judgeConversation = (checks: JudgeCheck[]): Expectation[] => {
	const verdictCache = new WeakMap<
		AxRunOutput,
		Promise<Record<string, boolean>>
	>();
	const verdictsFor = (output: AxRunOutput) => {
		let cached = verdictCache.get(output);
		if (!cached) {
			cached = judgeVerdicts({ output, checks });
			verdictCache.set(output, cached);
		}
		return cached;
	};

	return checks.map((check) => ({
		name: check.name,
		kind: "conduct",
		score: async (output: AxRunOutput): Promise<AxScore> => {
			try {
				const verdicts = await verdictsFor(output);
				return {
					name: check.name,
					score: verdicts[check.name] ? 1 : 0,
					metadata: { judge: JUDGE_MODEL, question: check.question },
				};
			} catch (error) {
				return {
					name: check.name,
					score: null,
					metadata: {
						why: `judge call failed: ${String(error).slice(0, 200)}`,
					},
				};
			}
		},
	}));
};
