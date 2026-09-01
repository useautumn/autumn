import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { currentSpan, Eval } from "braintrust";
import {
	ARMS_TO_RUN,
	BRAINTRUST_PROJECT,
	MAX_CONCURRENT_ARMS,
} from "./axConstants.ts";
import type { AxCase } from "./cases/types/axCase.ts";
import { describeToolUse } from "./driver/describeToolUse.ts";
import { type CompletedTurn, runAgentCase } from "./driver/runAgentCase.ts";
import { inspectWorkspaceConfig } from "./grading/inspectConfig.ts";
import { renderScorecard } from "./grading/renderScorecard.ts";
import {
	captureConfigText,
	inspectConfigSnapshots,
} from "./grading/turnSnapshots.ts";
import type { AxScore } from "./grading/types/axScore.ts";
import { equipAgent } from "./kit/equipAgent.ts";
import { bareKit, defaultKit, kitUnderTest } from "./kit/kits.ts";
import type { AgentKit } from "./kit/types/agentKit.ts";
import { llmUser } from "./simulator/llmUser.ts";
import { scriptedTurns } from "./simulator/scriptedTurns.ts";
import { simulatedUser } from "./simulator/simulatedUser.ts";
import type { Arm } from "./types/arm.ts";
import type { AxRunOutput } from "./types/axRunOutput.ts";
import { createCaseWorkspace } from "./workspace/createCaseWorkspace.ts";
import { installAtmnStub } from "./workspace/installAtmnStub.ts";
import { saveRunArtifact } from "./workspace/saveRunArtifact.ts";
import { sweepStaleWorkspaces } from "./workspace/sweepStaleWorkspaces.ts";

const turnSourceFor = (axCase: AxCase) => {
	if (axCase.simulatedUser)
		return llmUser({ prompt: axCase.prompt, ...axCase.simulatedUser });
	if (axCase.answers)
		return simulatedUser({ prompt: axCase.prompt, answers: axCase.answers });
	return scriptedTurns([axCase.prompt, ...(axCase.followUpMessages ?? [])]);
};

/** Braintrust renders chat-shaped input/output in the thread view, and each
 * tool call becomes its own child span so the agent's actions are visible. */
const logTurnToBraintrust = (turn: CompletedTurn) => {
	currentSpan().traced(
		(turnSpan) => {
			turnSpan.log({
				input: [{ role: "user", content: turn.userText }],
				output: [
					{
						role: "assistant",
						content: turn.agentText.trim() || `(no reply — ${turn.subtype})`,
					},
				],
			});
			for (const tool of turn.toolUses) {
				turnSpan.traced(
					(toolSpan) => {
						toolSpan.log({
							input: tool.input,
							output: describeToolUse(tool, turn.workspaceDir),
						});
					},
					{ name: describeToolUse(tool, turn.workspaceDir), type: "tool" },
				);
			}
		},
		{ name: `turn ${turn.index + 1}`, type: "llm" },
	);
};

/**
 * One case = one eval file, run once per arm. Each arm is a named kit —
 * default "with" (the pack) vs "without" (bare) — and the delta between arms
 * is the metric. Braintrust logging is optional: without BRAINTRUST_API_KEY
 * the eval still runs and prints locally.
 */
export const initAxEval = ({
	axCase,
	kit = defaultKit(),
	arms = { with: kit, without: bareKit() },
	trialCount,
	maxTurns,
	timeoutMs,
}: {
	axCase: AxCase;
	/** Swap what the equipped arm gets; pass `arms` instead for full control. */
	kit?: AgentKit;
	arms?: Record<Arm, AgentKit>;
	trialCount?: number;
	maxTurns?: number;
	timeoutMs?: number;
}) => {
	// Grader-proof tests import eval files for their case definitions; never
	// spawn agents from inside bun test.
	if (process.env.NODE_ENV === "test") return;

	const selectedArms = Object.fromEntries(
		Object.entries(arms).filter(
			([arm]) => ARMS_TO_RUN.length === 0 || ARMS_TO_RUN.includes(arm),
		),
	);
	if (Object.keys(selectedArms).length === 0) {
		throw new Error(
			`AX_EVALS_ARM=${ARMS_TO_RUN.join(",")} matched none of: ${Object.keys(arms).join(", ")}`,
		);
	}

	// A single arm streams the conversation live; concurrent arms would
	// interleave lines, so they render atomic per-turn blocks instead.
	const renderMode =
		Object.keys(selectedArms).length === 1 && (trialCount ?? 1) === 1
			? ("chat" as const)
			: ("blocks" as const);

	const runArm = async (arm: Arm): Promise<AxRunOutput> => {
		const armKit = selectedArms[arm];
		if (!armKit) throw new Error(`Unknown arm "${arm}"`);
		await sweepStaleWorkspaces();
		const workspace = await createCaseWorkspace(`${axCase.name}-${arm}`);
		try {
			// node:fs, not Bun.write — this code runs under the braintrust CLI (node)
			for (const [path, content] of Object.entries(
				axCase.existingFiles ?? {},
			)) {
				await writeFile(join(workspace.dir, path), content);
			}
			const equipment = await equipAgent({
				workspaceDir: workspace.dir,
				kit: armKit,
			});
			if (axCase.scenario?.stubAtmn)
				await installAtmnStub({ workspaceDir: workspace.dir });
			const configTextAfterTurn: (string | null)[] = [];
			const turnSource = turnSourceFor(axCase);
			const run = await runAgentCase({
				label: `${axCase.name}/${arm}`,
				cwd: workspace.dir,
				turnSource,
				skillPluginDir: equipment.pluginDir,
				skillIds: equipment.skillIds,
				maxTurns,
				timeoutMs,
				renderMode,
				systemPromptAppend: axCase.scenario?.primer,
				onTurn: (turn) => {
					configTextAfterTurn.push(captureConfigText(workspace.dir));
					logTurnToBraintrust(turn);
				},
			});
			const configAfterTurn = await inspectConfigSnapshots({
				workspaceDir: workspace.dir,
				configTexts: configTextAfterTurn,
			});
			const config = await inspectWorkspaceConfig(workspace.dir);
			const artifactPath = await saveRunArtifact({
				caseName: axCase.name,
				arm,
				configText: captureConfigText(workspace.dir),
			});
			if (artifactPath)
				process.stderr.write(`│  config saved: ${artifactPath}\n`);
			return {
				arm,
				skillId: equipment.underTestSkillId,
				kitSkillIds: equipment.skillIds,
				config,
				configAfterTurn,
				askedAbout: turnSource.askedTopics?.() ?? [],
				...run,
			};
		} finally {
			await workspace.cleanup();
		}
	};

	const scorecard = renderScorecard({
		arms: Object.keys(selectedArms),
		expectationCount: axCase.expect.length,
	});

	// Named wrappers so Braintrust shows "config valid", not "scorer_0" — and
	// so the terminal scorecard can print per-arm results as they land.
	const scorers = axCase.expect.map((expectation) => {
		const scorer = async ({
			output,
		}: {
			output: AxRunOutput;
		}): Promise<AxScore> => {
			const score = await expectation.score(output);
			scorecard.record(output.arm, score);
			return score;
		};
		Object.defineProperty(scorer, "name", { value: expectation.name });
		return scorer;
	});

	return Eval<{ arm: Arm }, AxRunOutput>(
		BRAINTRUST_PROJECT,
		{
			experimentName: axCase.name,
			data: Object.entries(selectedArms).map(([arm, armKit]) => ({
				input: { arm },
				metadata: {
					arm,
					skill: kitUnderTest(armKit),
					kitSkills: armKit.skills.map((skill) => skill.name),
					case: axCase.name,
				},
			})),
			maxConcurrency: MAX_CONCURRENT_ARMS,
			trialCount,
			task: (input) => runArm(input.arm),
			scores: scorers,
		},
		{ noSendLogs: !process.env.BRAINTRUST_API_KEY },
	);
};
