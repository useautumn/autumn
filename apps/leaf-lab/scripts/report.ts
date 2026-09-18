import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type Measurement = {
	kind: string;
	turnIndex?: number;
	turnType?: string;
	elapsedMs?: number;
	fromFirstPromptMs?: number;
	retained?: boolean;
	[key: string]: unknown;
};

const expectationScorers: Record<string, string> = {
	"tools.called": "Expected tool calls",
	"api.called": "Expected API calls",
	"api.calledInOrder": "Expected API call order",
	"api.calledAfterApproval": "Expected API calls after approval",
	"api.calledTimes": "Expected API call counts",
	"approval.count": "Expected approval count",
	"api.bodyExcludes": "Expected API body exclusions",
	"api.bodyNumberFields": "Expected API body number fields",
	"response.mentions": "Final text includes",
	"response.asked": "Asked clarification",
	"response.askedBeforeTool": "Asked clarification before tool",
	"response.concise": "Concise",
	"state.subscriptions": "Final subscriptions",
};

export function assertionCoverage(
	expected: unknown,
	scores: Record<string, number | null> = {},
) {
	if (expected === undefined || expected === null) return null;
	const types: string[] = [];
	let declaredExpectationCount = 0;
	if (Array.isArray(expected)) {
		for (const entry of expected) {
			if (typeof entry?.type === "string") {
				types.push(entry.type);
				declaredExpectationCount++;
			}
		}
	} else if (typeof expected === "object") {
		const legacy = expected as Record<string, unknown>;
		for (const [key, type] of [
			["toolCalls", "tools.called"],
			["apiCalls", "api.called"],
			["finalTextIncludes", "response.mentions"],
		] as const) {
			const entries = legacy[key];
			if (Array.isArray(entries) && entries.length) {
				types.push(type);
				declaredExpectationCount += entries.length;
			}
		}
	}
	const active = new Set(
		types.map((type) => expectationScorers[type]).filter(Boolean),
	);
	const known = new Set(Object.values(expectationScorers));
	return {
		declaredExpectationCount,
		activeScorers: Object.keys(scores).filter((name) => active.has(name)),
		activePassed: Object.entries(scores).filter(
			([name, score]) => active.has(name) && score === 1,
		).length,
		inactiveScorers: Object.keys(scores).filter(
			(name) => known.has(name) && !active.has(name),
		),
		inactivePerfect: Object.entries(scores).filter(
			([name, score]) => known.has(name) && !active.has(name) && score === 1,
		).length,
		otherScorers: Object.keys(scores).filter((name) => !known.has(name)),
		unknownExpectationTypes: types.filter((type) => !expectationScorers[type]),
	};
}

type ScoredCase = {
	metadata?: { caseName?: string; caseId?: string };
	input?: { caseId?: string; conversation?: Array<{ type: string }> };
	expected?: unknown;
	scores?: Record<string, number | null>;
	error?: unknown;
};

const cell = (value: unknown) =>
	String(value ?? "—")
		.replaceAll("|", "\\|")
		.replaceAll("\n", " ")
		.replaceAll("\r", " ");
const seconds = (ms: number | null | undefined) =>
	ms == null ? "—" : `${(ms / 1000).toFixed(2)} s`;

export function classifyOutcome(status: string, evidence: string) {
	if (status === "planned") return "not-run";
	if (
		/A dev server is already running for this eve agent\.|Eve host exited; inspect|Eve host did not become healthy/.test(
			evidence,
		)
	)
		return "host-startup-infrastructure";
	if (/Evaluator timed out/.test(evidence)) return "evaluator-timeout";
	if (status === "passed") return "passed";
	if (status === "running") return "in-progress";
	return "assertions-or-case-error";
}

export async function invocationEvidence(directory: string) {
	const paths = (await readdir(directory)).filter(
		(file) =>
			file === "stderr.log" ||
			file === "stdout.log" ||
			file.endsWith("-host.log") ||
			file === "scores.json",
	);
	return (
		await Promise.all(
			paths.map((file) => readFile(resolve(directory, file), "utf8")),
		)
	).join("\n");
}

export function approvalTiming(measurements: Measurement[]) {
	const turns: Array<{
		turnIndex: number | null;
		turnType: string;
		approvalReadyMs: number[];
	}> = [];
	for (const measurement of measurements) {
		if (measurement.kind === "turn_started")
			turns.push({
				turnIndex: measurement.turnIndex ?? null,
				turnType: measurement.turnType ?? "unknown",
				approvalReadyMs: [],
			});
		if (
			measurement.kind === "approval_ready" &&
			typeof measurement.elapsedMs === "number"
		) {
			const turn = turns.at(-1);
			if (turn) turn.approvalReadyMs.push(measurement.elapsedMs);
		}
	}
	return turns.map((turn) => ({
		...turn,
		userTurnLastApprovalReadyMs:
			turn.turnType === "user" && turn.approvalReadyMs.length
				? Math.max(...turn.approvalReadyMs)
				: null,
		classification:
			turn.turnType !== "user"
				? "post-approval"
				: turn.approvalReadyMs.length
					? "approval-ready"
					: "no-approval-observed-read-only-or-failed",
	}));
}

export function firstReadiness(measurements: Measurement[]) {
	let userTurns = 0;
	let turnType = "unknown";
	let firstApproval: Measurement | undefined;
	let firstResponse: Measurement | undefined;
	let approvalUserTurn = 0;
	let responseUserTurn = 0;
	for (const measurement of measurements) {
		if (measurement.kind === "turn_started") {
			turnType = measurement.turnType ?? "unknown";
			if (turnType === "user") userTurns++;
		}
		if (turnType !== "user") continue;
		if (
			!firstApproval &&
			measurement.kind === "approval_ready" &&
			!measurement.retained
		) {
			firstApproval = measurement;
			approvalUserTurn = userTurns;
		}
		if (!firstResponse && measurement.kind === "user_response_ready") {
			firstResponse = measurement;
			responseUserTurn = userTurns;
		}
	}
	const measuredFromFirst =
		typeof firstApproval?.fromFirstPromptMs === "number";
	return {
		firstApprovalReadyMs: firstApproval
			? approvalUserTurn === 1
				? (firstApproval.elapsedMs ?? null)
				: measuredFromFirst
					? (firstApproval.fromFirstPromptMs ?? null)
					: null
			: null,
		firstApprovalTimingBasis: !firstApproval
			? "no-approval-observed"
			: approvalUserTurn === 1
				? "initial-user-turn"
				: measuredFromFirst
					? "scripted-replies-wall-time-no-human-wait"
					: "initial-prompt-total-unavailable",
		userInputRequiredBeforeApproval: firstApproval
			? approvalUserTurn > 1
			: null,
		firstApprovalUserTurn: firstApproval ? approvalUserTurn : null,
		firstApprovalTriggeringReplyMs: firstApproval?.elapsedMs ?? null,
		firstUserResponseReadyMs:
			firstResponse?.fromFirstPromptMs ??
			(responseUserTurn === 1 ? (firstResponse?.elapsedMs ?? null) : null),
	};
}

type ProviderUsage = {
	file: string;
	usage?: { cost?: number; [key: string]: unknown };
	error?: string;
	[key: string]: unknown;
};
export function providerCost(usage: ProviderUsage[]) {
	const observed = usage.flatMap((request) =>
		typeof request.usage?.cost === "number" &&
		Number.isFinite(request.usage.cost)
			? [request.usage.cost]
			: [],
	);
	return {
		reportedCost: observed.length
			? observed.reduce((sum, cost) => sum + cost, 0)
			: null,
		requests: usage.length,
		requestsWithReportedCost: observed.length,
		missingCostRequests: usage.length - observed.length,
		scope:
			"Provider-reported generative-model usage.cost only; excludes Jev, scorer judges and any requests without captured usage. Not total system cost.",
	};
}

export async function buildReport(directory: string) {
	const manifest = JSON.parse(
		await readFile(resolve(directory, "manifest.json"), "utf8"),
	);
	const invocations = [];
	for (const invocation of manifest.invocations) {
		const outcomeClassification = classifyOutcome(
			invocation.status,
			await invocationEvidence(invocation.directory),
		);
		const accuracyEligible = ![
			"host-startup-infrastructure",
			"evaluator-timeout",
			"not-run",
			"in-progress",
		].includes(outcomeClassification);
		let scores:
			| {
					error?: unknown;
					summary?: unknown;
					results?: ScoredCase[];
			  }
			| undefined;
		let scoreArtifactError: string | undefined;
		try {
			scores = JSON.parse(
				await readFile(resolve(invocation.directory, "scores.json"), "utf8"),
			);
		} catch (error) {
			scoreArtifactError = String(error);
		}
		const driverRuns: Array<{
			file: string;
			name?: string;
			error?: string;
			turns?: ReturnType<typeof approvalTiming>;
			cumulativeBackendApprovalReadyMs?: number | null;
			measurements?: Measurement[];
			proposalAttempts?: number;
			firstReadiness?: ReturnType<typeof firstReadiness>;
			providerUsage?: ProviderUsage[];
			providerCost?: ReturnType<typeof providerCost>;
		}> = [];
		const artifactFiles = (await readdir(invocation.directory)).sort();
		const providerUsage: ProviderUsage[] = [];
		for (const file of artifactFiles.filter((name) =>
			name.endsWith("-provider-timing.json"),
		)) {
			try {
				providerUsage.push({
					...JSON.parse(
						await readFile(resolve(invocation.directory, file), "utf8"),
					),
					file,
				});
			} catch (error) {
				providerUsage.push({ file, error: String(error) });
			}
		}
		for (const file of artifactFiles) {
			if (!/^\d+-(opus|jev|flash)\.json$/.test(file)) continue;
			try {
				const driver = JSON.parse(
					await readFile(resolve(invocation.directory, file), "utf8"),
				);
				const turns = approvalTiming(driver.measurements ?? []);
				const usage = providerUsage.filter((request) =>
					request.file.startsWith(`${file.slice(0, -5)}-`),
				);
				driverRuns.push({
					file,
					name: driver.name,
					turns,
					firstReadiness: firstReadiness(driver.measurements ?? []),
					providerUsage: usage,
					providerCost: providerCost(usage),
					cumulativeBackendApprovalReadyMs: turns.some(
						(turn) => turn.userTurnLastApprovalReadyMs !== null,
					)
						? turns.reduce(
								(sum, turn) => sum + (turn.userTurnLastApprovalReadyMs ?? 0),
								0,
							)
						: null,
					measurements: driver.measurements,
					proposalAttempts: driver.proposalAttempts,
				});
			} catch (error) {
				driverRuns.push({ file, error: String(error) });
			}
		}
		invocations.push({
			...invocation,
			outcomeClassification,
			accuracyEligible,
			providerUsage,
			providerCost: providerCost(providerUsage),
			scoreArtifactError,
			evaluationError: scores?.error,
			summary: scores?.summary,
			cases: scores?.results?.map((result, index) => {
				const caseId = result.metadata?.caseId ?? result.input?.caseId;
				const attempts = caseId
					? driverRuns.filter((driver) => driver.name === caseId)
					: [];
				const totals = attempts.flatMap((driver) =>
					driver.cumulativeBackendApprovalReadyMs == null
						? []
						: [driver.cumulativeBackendApprovalReadyMs],
				);
				return {
					caseIndex: index,
					accuracyEligible,
					outcomeClassification,
					caseId,
					firstReadiness:
						attempts.length === 1
							? (attempts[0]?.firstReadiness ?? null)
							: null,
					providerCost: providerCost(
						attempts.flatMap((driver) => driver.providerUsage ?? []),
					),
					caseName: result.metadata?.caseName ?? `(unnamed case ${index + 1})`,
					scores: result.scores,
					error: result.error ?? null,
					errorDescription:
						result.error != null &&
						typeof result.error === "object" &&
						Object.keys(result.error).length === 0
							? "Error present; message lost during serialization. See stderr.log and raw trace artifacts."
							: null,
					status: result.error
						? "error"
						: Object.values(result.scores ?? {}).some(
									(score) => score === null || score < 1,
								)
							? "failed"
							: Object.keys(result.scores ?? {}).length
								? "passed"
								: "unscored",
					assertionCoverage: assertionCoverage(result.expected, result.scores),
					scriptedApprovalTurns:
						result.input?.conversation?.filter(
							(turn) => turn.type === "approve",
						).length ?? null,
					timingEvidence: attempts.map((driver) => driver.file),
					timingStatus: !attempts.length
						? "missing-driver-evidence"
						: !totals.length
							? "no-approval-observed"
							: "approval-observed",
					cumulativeBackendApprovalReadyMs: totals.length
						? totals.reduce((sum, total) => sum + total, 0)
						: null,
				};
			}),
			driverRuns,
			caseTimingMapping:
				"Exact match of score metadata.caseId (or input.caseId) to driver.name; missing IDs or missing driver reports are never joined by position.",
		});
	}
	const report = {
		schemaVersion: 1,
		status: manifest.status,
		sourceFingerprint: manifest.sourceFingerprint,
		corpusProvenance: manifest.corpusProvenance ?? {
			classification: "legacy-unlabeled",
			interpretation:
				"Use saved source.json to establish corpus identity; this run predates explicit correction provenance.",
		},
		notes: [
			"Process duration includes startup and scoring; it is NOT approval latency.",
			"Headline latency is the FIRST non-retained approval-ready event. Initial-turn elapsedMs is exact; after clarification, only measured fromFirstPromptMs is an initial-prompt total (scripted replies, no human waiting). Older multi-turn traces without it remain unavailable.",
			"cumulativeBackendApprovalReadyMs sums the last readiness timestamp per user turn including retained confirmations and retries; it is NOT prompt-to-first-button latency. Every turn and attempt remains available.",
			"All attempts and measurements are retained, including failed cases and repairs. No dollar costs are inferred from token counts.",
			"No approval observed does not prove read-only intent; consult the raw case input, error and trace.",
			"Host-startup infrastructure failures and whole-evaluator timeouts are excluded from model-accuracy interpretation. Their zero error-handler scorer panels do not prove model failures. Original failed attempts remain visible after infrastructure replay.",
			"Coverage counts declared expectation objects (legacy entries individually), not individual nested predicates. Active scorer panels are matched to declared expectation types; inactive perfect panels are excluded from the active pass count. Other/custom scorers are listed separately rather than guessed as active or vacuous.",
		],
		invocations,
	};
	await writeFile(
		resolve(directory, "report.json"),
		JSON.stringify(report, null, 2),
		{ mode: 0o600 },
	);
	const markdown = [
		"# Leaf fixture-suite benchmark",
		"",
		`Status: **${cell(report.status)}**`,
		`Corpus: **${cell(report.corpusProvenance.classification)}**. ${cell(report.corpusProvenance.interpretation)}`,
		`Corpus fingerprint: ${cell(report.corpusProvenance.corpusFingerprint)}. Original archive SHA-256: ${cell(report.corpusProvenance.originalSourceArchive?.sha256)}.`,
		"",
		"## Invocation outcomes",
		"",
		"| Arm | Eval | Repeat | Outcome | Process duration (not approval latency) |",
		"| --- | --- | ---: | --- | ---: |",
		...invocations.map(
			(run) =>
				`| ${cell(run.arm)} | ${cell(run.target)}${run.retryOf ? " (infrastructure replay)" : ""} | ${cell(run.repeat)} | ${cell(run.outcomeClassification)} | ${seconds(run.processDurationMs)} |`,
		),
		"",
		"## Per-case scores and approval timing",
		"",
		"| Arm | Eval / case | Outcome | Active panels passed | Declared expectations | Inactive perfect panels | Other panels | Prompt → FIRST approval ready | Timing basis |",
		"| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
	];
	for (const run of invocations) {
		for (const result of run.cases ?? []) {
			const coverage = result.assertionCoverage;
			markdown.push(
				`| ${cell(run.arm)} | ${cell(run.target)} / ${cell(result.caseName)} | ${cell(result.accuracyEligible ? result.status : result.outcomeClassification)} | ${!result.accuracyEligible ? "excluded (infrastructure/timeout)" : coverage ? `${coverage.activePassed}/${coverage.activeScorers.length}` : "unknown"} | ${cell(coverage?.declaredExpectationCount)} | ${cell(coverage?.inactivePerfect)} | ${cell(coverage?.otherScorers.length)} | ${seconds(result.firstReadiness?.firstApprovalReadyMs)} | ${cell(result.firstReadiness?.firstApprovalTimingBasis ?? result.timingStatus)}${result.firstReadiness?.userInputRequiredBeforeApproval ? "; user input required" : ""} |`,
			);
		}
		if (!run.cases?.length)
			markdown.push(
				`| ${cell(run.arm)} | ${cell(run.target)} | ${cell(run.status)}; no scored cases | — | — | — | — | — | ${cell(run.evaluationError ?? run.scoreArtifactError ?? "not run")} |`,
			);
	}
	markdown.push("", "## Scorer details and errors", "");
	for (const run of invocations) {
		for (const result of run.cases ?? []) {
			markdown.push(
				`- **${cell(run.arm)} / ${cell(result.caseId ?? result.caseName)}**: ${Object.entries(
					result.scores ?? {},
				)
					.map(([name, score]) => `${cell(name)} = ${cell(score)}`)
					.join(
						"; ",
					)}. Error: ${result.error == null ? "none" : cell(result.errorDescription ?? JSON.stringify(result.error))}.`,
			);
		}
	}
	markdown.push(
		"",
		"## Interpretation",
		"",
		...report.notes.map((note) => `- ${note}`),
		"",
		"Raw commands, logs, traces, repairs and usage remain in the per-invocation directories; report.json contains exact case-ID timing joins and full measured attempts.",
		"",
	);
	await writeFile(resolve(directory, "report.md"), markdown.join("\n"), {
		mode: 0o600,
	});
	return report;
}

if (import.meta.main) {
	if (!process.argv[2])
		throw new Error("Usage: bun scripts/report.ts SUITE_DIRECTORY");
	await buildReport(resolve(process.argv[2]));
}
