import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { currentSpan, Eval } from "braintrust";
import chalk from "chalk";
import {
	ARMS_TO_RUN,
	BRAINTRUST_PROJECT,
	MAX_CONCURRENT_ARMS,
} from "./axConstants.ts";
import type { IntegrationCase } from "./cases/types/integrationCase.ts";
import { describeToolUse } from "./driver/describeToolUse.ts";
import type { CompletedTurn } from "./driver/runAgentCase.ts";
import { runCase } from "./driver/runCase.ts";
import { probeFixtureApp } from "./grading/fixtureProbe.ts";
import { renderIntegrationRun } from "./grading/renderIntegrationRun.ts";
import {
	readOracleCustomer,
	readOracleLicenseAssignments,
} from "./grading/sandboxOracle.ts";
import { renderScorecard } from "./grading/renderScorecard.ts";
import type { AxScore } from "./grading/types/axScore.ts";
import { equipAgent } from "./kit/equipAgent.ts";
import { bareKit, integrateKit, kitUnderTest } from "./kit/kits.ts";
import type { AgentKit } from "./kit/types/agentKit.ts";
import { llmUser } from "./simulator/llmUser.ts";
import { scriptedTurns } from "./simulator/scriptedTurns.ts";
import type { Arm } from "./types/arm.ts";
import type { AxRunOutput } from "./types/axRunOutput.ts";
import {
	assertBackendReachable,
	evalBackendUrl,
} from "./workspace/backendUrl.ts";
import { createFixtureWorkspace } from "./workspace/createFixtureWorkspace.ts";
import {
	createEvalOrg,
	deleteEvalOrg,
	seedEvalCustomer,
} from "./workspace/evalOrg.ts";
import { saveFixtureDiff } from "./workspace/saveFixtureDiff.ts";
import { ATMN_DIR } from "./workspace/workspacePaths.ts";
import { sweepStaleWorkspaces } from "./workspace/sweepStaleWorkspaces.ts";

const run = promisify(execFile);

/** Push the case's catalog into the run org before the agent starts — the
 * fixture integrates against an org whose plans already exist. */
const seedCatalog = async ({
	workspaceDir,
	config,
	backendUrl,
	secretKey,
}: {
	workspaceDir: string;
	config: string;
	backendUrl: string;
	secretKey: string;
}) => {
	await writeFile(join(workspaceDir, "autumn.config.ts"), config);
	// Without the key in env the CLI falls into interactive login and hangs.
	await run("node", [join(ATMN_DIR, "dist/cli.js"), "--local", "--headless", "push"], {
		cwd: workspaceDir,
		env: {
			...process.env,
			ATMN_BACKEND_URL: backendUrl,
			AUTUMN_SECRET_KEY: secretKey,
		},
	});
	// The config stays in the workspace on purpose: it's how a real post-setup
	// repo looks, and it's the agent's reference for plan/feature ids.
};

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

// Random base so concurrent eval processes don't probe each other's apps.
let nextProbePort = 4310 + Math.floor(Math.random() * 2000);

/**
 * Integration eval: the agent edits a copied fixture app; grading boots the
 * result, replays probes against it, and reads the run org as the oracle.
 */
export const initIntegrationEval = ({
	integrationCase,
	kit = integrateKit(),
	arms = { with: kit, without: bareKit() },
	maxTurns,
	timeoutMs,
}: {
	integrationCase: IntegrationCase;
	kit?: AgentKit;
	arms?: Record<Arm, AgentKit>;
	maxTurns?: number;
	timeoutMs?: number;
}) => {
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

	const compact = process.env.AX_EVALS_COMPACT === "1";
	const renderMode = compact
		? ("compact" as const)
		: Object.keys(selectedArms).length === 1
			? ("chat" as const)
			: ("blocks" as const);
	const backendUrl = evalBackendUrl();

	const runArm = async (arm: Arm): Promise<AxRunOutput> => {
		const armKit = selectedArms[arm];
		if (!armKit) throw new Error(`Unknown arm "${arm}"`);
		await assertBackendReachable(backendUrl);
		await sweepStaleWorkspaces();
		const orgRunId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
		// Integration orgs always get a Stripe sub-account: billing flows
		// (paid attach, checkout) are the whole point. Catalog orgs never do.
		const org = await createEvalOrg({ runId: orgRunId, withStripe: true });
		const workspace = await createFixtureWorkspace({
			label: `${integrationCase.name}-${arm}`,
			fixture: integrationCase.fixture,
			secretKey: org.secretKey,
		});
		try {
			await seedCatalog({
				workspaceDir: workspace.dir,
				config: integrationCase.catalogConfig,
				backendUrl,
				secretKey: org.secretKey,
			});
			for (const [path, content] of Object.entries(
				integrationCase.existingFiles ?? {},
			)) {
				await writeFile(join(workspace.dir, path), content);
			}
			if (integrationCase.seedCustomer) {
				await seedEvalCustomer({
					org,
					backendUrl,
					seed: integrationCase.seedCustomer,
				});
			}
			const equipment = await equipAgent({
				workspaceDir: workspace.dir,
				kit: armKit,
			});
			const turnSource = integrationCase.simulatedUser
				? llmUser({
						prompt: integrationCase.prompt,
						...integrationCase.simulatedUser,
					})
				: scriptedTurns([integrationCase.prompt]);
			const agentRun = await runCase({
				label: `${integrationCase.name}/${arm}`,
				cwd: workspace.dir,
				turnSource,
				skillPluginDir: equipment.pluginDir,
				skillIds: equipment.skillIds,
				maxTurns,
				timeoutMs,
				renderMode,
				systemPromptAppend: integrationCase.scenario?.primer,
				// The SDK reads AUTUMN_SECRET_KEY from env; the local server URL
				// must be passed as serverURL — the primer explains that.
				extraEnv: { AUTUMN_SECRET_KEY: org.secretKey },
				onTurn: logTurnToBraintrust,
			});

			// What did the agent write? Save the workspace diff so a run is
			// understandable without opening Braintrust.
			const { diff, path: diffPath } = await saveFixtureDiff({
				caseName: integrationCase.name,
				arm,
				fixture: integrationCase.fixture,
				workspaceDir: workspace.dir,
			});

			const port = nextProbePort++;
			const requests = integrationCase.probes.flatMap((probe) =>
				Array.from({ length: probe.repeat ?? 1 }, () => ({
					path: probe.path,
					method: probe.method,
					body: probe.body,
				})),
			);
			const probe = await probeFixtureApp({
				workspaceDir: workspace.dir,
				port,
				requests,
				extraEnv: { AUTUMN_SECRET_KEY: org.secretKey },
			});
			const oracle = await readOracleCustomer({
				backendUrl,
				secretKey: org.secretKey,
				customerId: integrationCase.oracleCustomerId,
			});
			const licenseAssignments = await readOracleLicenseAssignments({
				backendUrl,
				secretKey: org.secretKey,
				customerId: integrationCase.oracleCustomerId,
			});
			process.stderr.write(
				renderIntegrationRun({ arm, diff, probe, oracle }),
			);
			if (diffPath)
				process.stderr.write(chalk.dim(`diff saved: ${diffPath}\n`));

			return {
				arm,
				skillId: equipment.underTestSkillId,
				kitSkillIds: equipment.skillIds,
				config: { configFound: false, plans: [], features: [] },
				configAfterTurn: [],
				probe,
				oracle,
				licenseAssignments,
				fixtureDiff: diff,
				...agentRun,
			};
		} catch (error) {
			// Braintrust's progress UI swallows task errors — surface them.
			process.stderr.write(
				`\n[ax-evals] ${integrationCase.name}/${arm} failed:\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
			);
			throw error;
		} finally {
			await workspace.cleanup();
			await deleteEvalOrg({ runId: orgRunId }).catch((error) => {
				process.stderr.write(
					`[ax-evals] failed to delete eval org ${orgRunId}: ${error}\n`,
				);
			});
		}
	};

	const scorecard = renderScorecard({
		arms: Object.keys(selectedArms),
		expectationCount: integrationCase.expect.length,
		caseName: integrationCase.name,
	});

	const scorers = integrationCase.expect.map((expectation) => {
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
			experimentName: integrationCase.name,
			data: Object.entries(selectedArms).map(([arm, armKit]) => ({
				input: { arm },
				metadata: {
					arm,
					skill: kitUnderTest(armKit),
					kitSkills: armKit.skills.map((skill) => skill.name),
					case: integrationCase.name,
				},
			})),
			maxConcurrency: MAX_CONCURRENT_ARMS,
			task: (input) => runArm(input.arm),
			scores: scorers,
		},
		{ noSendLogs: !process.env.BRAINTRUST_API_KEY },
	);
};
