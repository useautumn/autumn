import type { ToolUse } from "../../driver/types/toolUse.ts";
import type { Expectation } from "../types/expectation.ts";

const isConfigWrite = (tool: ToolUse) =>
	(tool.name === "Write" || tool.name === "Edit") &&
	String(tool.input.file_path ?? "").endsWith("autumn.config.ts");

export const conduct = {
	/** the skill under test actually fired (null when the arm had none installed) */
	skillFired: (): Expectation => ({
		name: "used a skill from the kit",
		kind: "conduct",
		score: (output) => {
			const kitSkillIds = output.kitSkillIds ?? [];
			if (kitSkillIds.length === 0)
				return { name: "used a skill from the kit", score: null };
			const fired = output.toolUses.some(
				(tool) =>
					tool.name === "Skill" &&
					kitSkillIds.includes(String(tool.input.skill ?? "")),
			);
			return {
				name: "used a skill from the kit",
				score: fired ? 1 : 0,
				metadata: fired
					? undefined
					: { why: "the kit's skills were installed but never invoked" },
			};
		},
	}),

	/** the run completed without hitting the timeout */
	completed: (): Expectation => ({
		name: "finished without timing out",
		kind: "conduct",
		score: (output) => ({
			name: "finished without timing out",
			score: output.timedOut ? 0 : 1,
			metadata: {
				why: output.timedOut ? "the run hit its time limit" : undefined,
				wallMs: output.wallMs,
				turns: output.turns,
			},
		}),
	}),

	/** vague prompt: asked a question AND did not write the config in turn 0 */
	mustAskFirst: (): Expectation => ({
		name: "asked a question before writing the config",
		kind: "conduct",
		score: (output) => {
			const askedInOpening = (output.turnTexts[0] ?? "").includes("?");
			const wroteInOpening = output.toolUses.some(
				(tool) => tool.turn === 0 && isConfigWrite(tool),
			);
			const why =
				!askedInOpening && wroteInOpening
					? "wrote the config immediately without asking anything"
					: askedInOpening && wroteInOpening
						? "asked, but had already written the config in the same turn"
						: askedInOpening
							? undefined
							: "never asked a question";
			return {
				name: "asked a question before writing the config",
				score: askedInOpening && !wroteInOpening ? 1 : 0,
				metadata: { why, askedInOpening, wroteInOpening },
			};
		},
	}),

	/** clear prompt (twin): wrote the config in the opening turn, no stalling */
	mustWriteImmediately: (): Expectation => ({
		name: "wrote the config in the first turn, without asking",
		kind: "conduct",
		score: (output) => {
			const wrote = output.toolUses.some(
				(tool) => tool.turn === 0 && isConfigWrite(tool),
			);
			return {
				name: "wrote the config in the first turn, without asking",
				score: wrote ? 1 : 0,
				metadata: wrote
					? undefined
					: {
							why: "the first turn ended with no Write/Edit of autumn.config.ts",
						},
			};
		},
	}),

	/** no tool result hit harness misconfiguration (approval walls, missing
	 * binaries) — benign probe failures like reading a missing file are fine.
	 * A 0 here means fix the eval setup before trusting other scores. */
	noHarnessFriction: (): Expectation => ({
		name: "no harness friction",
		kind: "conduct",
		score: (output) => {
			const friction = output.toolUses.filter(
				(tool) =>
					tool.result?.isError &&
					/requires approval|command not found|permission denied/i.test(
						tool.result.text,
					),
			);
			return {
				name: "no harness friction",
				score: friction.length === 0 ? 1 : 0,
				metadata:
					friction.length === 0
						? undefined
						: {
								why: "the environment blocked the agent — eval setup problem, not agent behavior",
								blocked: friction.map(
									(tool) => `${tool.name}: ${tool.result?.text.slice(0, 100)}`,
								),
							},
			};
		},
	}),

	/** never applied the catalog (`push --yes`) — eval users don't approve
	 * pushes, so the run must end at a written, previewed config */
	noUnapprovedPush: (): Expectation => ({
		name: "did not push without approval",
		kind: "conduct",
		score: (output) => {
			const applies = output.toolUses.filter(
				(tool) =>
					tool.name === "Bash" &&
					/\bpush\b[^\n]*(--yes|-y\b)/.test(String(tool.input.command ?? "")),
			);
			return {
				name: "did not push without approval",
				score: applies.length === 0 ? 1 : 0,
				metadata:
					applies.length === 0
						? undefined
						: {
								why: "applied the catalog with `push --yes` though the user never approved a push",
								commands: applies.map((tool) =>
									String(tool.input.command ?? "").slice(0, 100),
								),
							},
			};
		},
	}),

	/** the config was written at some point (any turn) */
	wroteConfig: (): Expectation => ({
		name: "wrote autumn.config.ts",
		kind: "conduct",
		score: (output) => {
			const wrote = output.toolUses.some(isConfigWrite);
			return {
				name: "wrote autumn.config.ts",
				score: wrote ? 1 : 0,
				metadata: wrote
					? undefined
					: { why: "no Write/Edit of autumn.config.ts in any turn" },
			};
		},
	}),
};
