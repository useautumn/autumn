import { type ChatMessage, completeChat } from "../llm/completeChat.ts";
import type { TurnSource } from "./types/turnSource.ts";

const USER_MODEL = process.env.AX_EVALS_USER_MODEL ?? "openai/gpt-5.4-mini";

const DONE_TOKEN = "<<DONE>>";

const systemPrompt = ({
	goal,
	facts,
	approvesPush,
}: {
	goal: string;
	facts: string;
	approvesPush: boolean;
}): string => `You are playing a HUMAN CUSTOMER talking to an AI coding agent that is setting up billing for your product. Stay in character; never reveal you are simulated.

Your goal: ${goal}

Facts you know (your private brief — the agent must ask to learn them):
${facts}

Rules:
- Answer what the agent just asked. A broad question deserves every fact in your brief that answers it (e.g. "what does each plan include?" covers limits AND feature differences like SSO). Do not volunteer facts about topics it hasn't asked about.
- Stay consistent with your brief. Never invent prices, limits, or features not in it.
- You are non-technical: you cannot approve tool permissions, run commands, or edit files. If asked to do those, say you can't and tell the agent to do its best without it.
- If the agent asks nothing and seems done, or asks you to confirm a summary that matches your brief, approve it.
${
	approvesPush
		? "- If the agent asks whether to push, apply, or go live with the config, say yes — go ahead. If it pushed without asking, say so once and move on."
		: "- If the agent offers to push, apply, or deploy the config to Autumn, decline: the written config file is all you need. If it already pushed without asking, don't dwell on it."
}
- The job is NOT done until the agent says the config file is written${approvesPush ? " and applied" : ""}. If it proposes a structure or plan, approve and tell it to go ahead and write the config.
- Keep replies short — one or two sentences, like a busy founder on Slack.
- When the agent has finished the job (or is only waiting on things you can't do), reply with exactly ${DONE_TOKEN}`;

export const llmUser = ({
	prompt,
	goal,
	facts,
	maxUserTurns = 8,
	approvesPush = false,
}: {
	prompt: string;
	goal: string;
	facts: string;
	maxUserTurns?: number;
	approvesPush?: boolean;
}): TurnSource => {
	const history: ChatMessage[] = [
		{ role: "system", content: systemPrompt({ goal, facts, approvesPush }) },
		{ role: "assistant", content: prompt },
	];
	let opened = false;

	return {
		maxUserTurns,
		next: async (lastAgentText) => {
			if (!opened) {
				opened = true;
				return prompt;
			}
			if (!lastAgentText.trim()) return null;
			history.push({ role: "user", content: lastAgentText });
			const reply = await completeChat({
				model: USER_MODEL,
				messages: history,
			});
			history.push({ role: "assistant", content: reply });
			if (reply.includes(DONE_TOKEN)) return null;
			return reply.trim();
		},
	};
};
