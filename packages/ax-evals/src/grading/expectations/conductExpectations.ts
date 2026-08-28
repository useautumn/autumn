import type { ToolUse } from "../../driver/types/toolUse.ts";
import type { Expectation } from "../types/expectation.ts";

const isConfigWrite = (tool: ToolUse) =>
	(tool.name === "Write" || tool.name === "Edit") &&
	String(tool.input.file_path ?? "").endsWith("autumn.config.ts");

export const conduct = {
	/** the skill under test actually fired (null when the arm had none installed) */
	skillFired: (): Expectation => ({
		name: "skill fired",
		kind: "conduct",
		score: (output) => {
			const kitSkillIds = output.kitSkillIds ?? [];
			if (kitSkillIds.length === 0) return { name: "skill fired", score: null };
			const fired = output.toolUses.some(
				(tool) =>
					tool.name === "Skill" &&
					kitSkillIds.includes(String(tool.input.skill ?? "")),
			);
			return { name: "skill fired", score: fired ? 1 : 0 };
		},
	}),

	/** the run completed without hitting the timeout */
	completed: (): Expectation => ({
		name: "completed",
		kind: "conduct",
		score: (output) => ({
			name: "completed",
			score: output.timedOut ? 0 : 1,
			metadata: { wallMs: output.wallMs, turns: output.turns },
		}),
	}),

	/** vague prompt: asked a question AND did not write the config in turn 0 */
	mustAskFirst: (): Expectation => ({
		name: "asked before writing",
		kind: "conduct",
		score: (output) => {
			const askedInOpening = (output.turnTexts[0] ?? "").includes("?");
			const wroteInOpening = output.toolUses.some(
				(tool) => tool.turn === 0 && isConfigWrite(tool),
			);
			return {
				name: "asked before writing",
				score: askedInOpening && !wroteInOpening ? 1 : 0,
				metadata: { askedInOpening, wroteInOpening },
			};
		},
	}),

	/** clear prompt (twin): wrote the config in the opening turn, no stalling */
	mustWriteImmediately: (): Expectation => ({
		name: "wrote without stalling",
		kind: "conduct",
		score: (output) => ({
			name: "wrote without stalling",
			score: output.toolUses.some(
				(tool) => tool.turn === 0 && isConfigWrite(tool),
			)
				? 1
				: 0,
		}),
	}),

	/** the config was written at some point (any turn) */
	wroteConfig: (): Expectation => ({
		name: "wrote config",
		kind: "conduct",
		score: (output) => ({
			name: "wrote config",
			score: output.toolUses.some(isConfigWrite) ? 1 : 0,
		}),
	}),
};
