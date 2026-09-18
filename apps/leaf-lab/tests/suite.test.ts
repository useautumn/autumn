import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
	compareReports,
	comparisonOptions,
	toCsv,
} from "../scripts/compare.js";
import {
	approvalTiming,
	assertionCoverage,
	buildReport,
	classifyOutcome,
	firstReadiness,
	providerCost,
} from "../scripts/report.js";
import {
	corpusProvenance,
	filesUnder,
	fingerprint,
	freezeLab,
	options,
	ownedProcesses,
} from "../scripts/suite.js";

test("cleanup owns only exact frozen Eve CLI and its descendants", () => {
	const lab = "/private/suite/frozen/apps/leaf-lab";
	const processes = [
		{
			pid: 10,
			ppid: 1,
			command: `node ${lab}/node_modules/eve/bin/eve.js dev --port 1000`,
		},
		{ pid: 11, ppid: 10, command: "node worker.js" },
		{ pid: 12, ppid: 11, command: "node grandchild.js" },
		{
			pid: 13,
			ppid: 1,
			command:
				"node /another/frozen/apps/leaf-lab/node_modules/eve/bin/eve.js dev",
		},
		{
			pid: 14,
			ppid: 1,
			command: `bash -c node ${lab}/node_modules/eve/bin/eve.js dev`,
		},
		{
			pid: 15,
			ppid: 1,
			command: `node ${lab}/node_modules/eve/bin/eve.js development`,
		},
	];
	expect(ownedProcesses(processes, lab).map((entry) => entry.pid)).toEqual([
		10, 11, 12,
	]);
});

test("infrastructure classifications do not turn error-handler zeros into model failures", () => {
	expect(
		classifyOutcome(
			"failed",
			"A dev server is already running for this eve agent.",
		),
	).toBe("host-startup-infrastructure");
	expect(
		classifyOutcome("failed", "InternalAbortError: Evaluator timed out"),
	).toBe("evaluator-timeout");
	expect(classifyOutcome("failed", "Expected API calls: 0")).toBe(
		"assertions-or-case-error",
	);
});

test("first readiness ignores later gates and retained confirmations", () => {
	expect(
		firstReadiness([
			{ kind: "turn_started", turnType: "user" },
			{ kind: "approval_ready", elapsedMs: 50 },
			{ kind: "turn_started", turnType: "user" },
			{ kind: "approval_ready", elapsedMs: 80, retained: true },
			{ kind: "approval_ready", elapsedMs: 90 },
		]),
	).toMatchObject({
		firstApprovalReadyMs: 50,
		userInputRequiredBeforeApproval: false,
		firstApprovalTimingBasis: "initial-user-turn",
	});
});

test("initial prompt uses its elapsed clock and excludes postapproval gates", () => {
	expect(
		firstReadiness([
			{ kind: "turn_started", turnType: "user" },
			{ kind: "approval_ready", elapsedMs: 50, fromFirstPromptMs: 51 },
			{ kind: "turn_started", turnType: "approve" },
			{ kind: "approval_ready", elapsedMs: 500, fromFirstPromptMs: 800 },
		]),
	).toMatchObject({ firstApprovalReadyMs: 50, firstApprovalUserTurn: 1 });
	expect(
		firstReadiness([
			{ kind: "turn_started", turnType: "user" },
			{ kind: "user_response_ready", elapsedMs: 10 },
			{ kind: "turn_started", turnType: "approve" },
			{ kind: "approval_ready", elapsedMs: 500 },
		]).firstApprovalReadyMs,
	).toBeNull();
});

test("corrected corpus requires verified original provenance and retains the correction record", async () => {
	expect(() => options(["--corpus", "corrected"])).toThrow();
	const root = await mkdtemp(resolve(tmpdir(), "leaf-provenance-"));
	try {
		const archive = resolve(root, "original.tar.gz");
		const corrections = resolve(root, "corrections.md");
		await writeFile(archive, "original source archive test bytes");
		await writeFile(corrections, "Approved fixture correction rationale");
		const sha = createHash("sha256")
			.update(await readFile(archive))
			.digest("hex");
		const config = options([
			"--corpus",
			"corrected",
			"--corrections-file",
			corrections,
			"--original-source-archive",
			archive,
			"--original-source-sha256",
			sha,
		]);
		const source = {
			sha256: "source",
			files: [
				{ path: "apps/leaf/tests/evals/fixture.ts", sha256: "corrected" },
			],
		};
		const provenance = await corpusProvenance(config, root, source);
		expect(provenance.classification).toBe("corrected");
		expect(provenance.originalSourceArchive?.sha256).toBe(sha);
		expect(
			await readFile(resolve(root, "FIXTURE_CORRECTIONS.md"), "utf8"),
		).toBe("Approved fixture correction rationale");
		expect(provenance.interpretation).toContain(
			"not the unchanged original corpus",
		);
		await expect(
			corpusProvenance(
				{ ...config, originalSourceSha256: "0".repeat(64) },
				root,
				source,
			),
		).rejects.toThrow("SHA-256");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("clarification requires a global clock, never a last-reply substitute", () => {
	const prefix = [
		{ kind: "turn_started", turnType: "user" },
		{ kind: "user_response_ready", elapsedMs: 20 },
		{ kind: "turn_started", turnType: "user" },
	];
	expect(
		firstReadiness([...prefix, { kind: "approval_ready", elapsedMs: 50 }]),
	).toMatchObject({
		firstApprovalReadyMs: null,
		userInputRequiredBeforeApproval: true,
		firstApprovalTimingBasis: "initial-prompt-total-unavailable",
	});
	expect(
		firstReadiness([
			...prefix,
			{ kind: "approval_ready", elapsedMs: 50, fromFirstPromptMs: 100 },
		]),
	).toMatchObject({
		firstApprovalReadyMs: 100,
		firstApprovalTimingBasis: "scripted-replies-wall-time-no-human-wait",
	});
	expect(
		firstReadiness([
			{ kind: "turn_started", turnType: "user" },
			{ kind: "approval_ready", elapsedMs: 50, retained: true },
		]).firstApprovalReadyMs,
	).toBeNull();
});

test("costs use actual captured cost values without pricing missing usage", () => {
	expect(
		providerCost([
			{ file: "a", usage: { cost: 0.02 } },
			{ file: "b", usage: { prompt_tokens: 100 } },
		]),
	).toMatchObject({
		reportedCost: 0.02,
		requests: 2,
		requestsWithReportedCost: 1,
		missingCostRequests: 1,
	});
	expect(providerCost([]).reportedCost).toBeNull();
	expect(toCsv([{ case: 'a,"b"', status: "failed" }])).toContain('"a,""b"""');
});

test("comparison accepts explicit same-suite arm filters and rejects malformed options", () => {
	expect(
		comparisonOptions([
			"suite",
			"suite",
			"output",
			"--before-arm",
			"opus",
			"--after-arm",
			"jev",
		]).filters,
	).toEqual({ beforeArm: "opus", afterArm: "jev" });
	expect(comparisonOptions(["before", "after", "output"]).filters).toEqual({});
	for (const args of [
		["suite", "suite"],
		["a", "b", "c", "--before-arm"],
		["a", "b", "c", "--before-arm", "bogus"],
		["a", "b", "c", "--before-arm", "opus", "--before-arm", "jev"],
	])
		expect(() => comparisonOptions(args)).toThrow();
});

describe("suite configuration", () => {
	test("records explicit targeted coverage without changing default full coverage", () => {
		expect(options([]).targets).toEqual([]);
		expect(
			options(["--target", "agent/a.eval.ts", "--target", "agent/b.eval.ts"])
				.targets,
		).toEqual(["agent/a.eval.ts", "agent/b.eval.ts"]);
		expect(() => options(["--target"])).toThrow();
	});
	test("defaults to both arms without reducing fixture coverage", () => {
		expect(options([])).toMatchObject({
			arms: ["opus", "jev"],
			repeats: 1,
			execution: "single",
			dryRun: false,
		});
		expect(options(["--arms", "opus", "--dry-run"]).dryRun).toBe(true);
	});
	test("rejects malformed or ambiguous options", () => {
		for (const args of [
			["--repeats", "0"],
			["--arms", "opus,opus"],
			["--arms", "flash"],
			["--execution", "unknown"],
			["--output"],
			["--wat", "x"],
		])
			expect(() => options(args)).toThrow();
	});
});

describe("approval timing", () => {
	test("includes repair time, counts the last readiness once, separates approvals", () => {
		const turns = approvalTiming([
			{ kind: "turn_started", turnIndex: 1, turnType: "user" },
			{ kind: "repair", elapsedMs: 30 },
			{ kind: "approval_ready", elapsedMs: 80 },
			{ kind: "approval_ready", elapsedMs: 100 },
			{ kind: "turn_started", turnIndex: 2, turnType: "approve" },
			{ kind: "turn_completed", elapsedMs: 200 },
			{ kind: "turn_started", turnIndex: 3, turnType: "user" },
			{ kind: "turn_completed", elapsedMs: 20 },
		]);
		expect(turns.map((turn) => turn.userTurnLastApprovalReadyMs)).toEqual([
			100,
			null,
			null,
		]);
		expect(turns[2]?.classification).toBe(
			"no-approval-observed-read-only-or-failed",
		);
	});
	test("does not turn unscoped events into measured prompt latency", () => {
		expect(approvalTiming([{ kind: "approval_ready", elapsedMs: 50 }])).toEqual(
			[],
		);
	});
});

test("inventory ignores generated runtime and environment files; snapshot freezes source", async () => {
	const root = await mkdtemp(resolve(tmpdir(), "leaf-suite-"));
	try {
		const lab = resolve(root, "apps/leaf-lab");
		await mkdir(resolve(lab, ".eve"), { recursive: true });
		await writeFile(resolve(lab, "source.ts"), "original");
		await writeFile(resolve(lab, ".env"), "not copied");
		await writeFile(resolve(lab, ".eve/extra.eval.ts"), "not inventoried");
		const timingPath =
			"server/src/internal/billing/v2/actions/createSchedule/errors";
		await mkdir(resolve(root, timingPath), { recursive: true });
		await writeFile(
			resolve(root, timingPath, "normalizeCreateSchedulePhases.ts"),
			"timing helper",
		);
		expect(
			(await filesUnder(lab)).map((path) => path.split("/").at(-1)),
		).toEqual(["source.ts"]);
		const frozen = await freezeLab(root, resolve(root, "artifacts"));
		expect(
			await readFile(
				resolve(
					frozen,
					"../..",
					timingPath,
					"normalizeCreateSchedulePhases.ts",
				),
				"utf8",
			),
		).toBe("timing helper");
		await writeFile(resolve(lab, "source.ts"), "changed");
		expect(await readFile(resolve(frozen, "source.ts"), "utf8")).toBe(
			"original",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("shared dependency fingerprint ignores live lab edits but includes fixture PDFs", async () => {
	const root = await mkdtemp(resolve(tmpdir(), "leaf-fingerprint-"));
	try {
		await mkdir(resolve(root, "apps/leaf/contracts"), { recursive: true });
		await mkdir(resolve(root, "apps/leaf-lab"), { recursive: true });
		await writeFile(resolve(root, "bun.lock"), "lock");
		await writeFile(resolve(root, "package.json"), "{}");
		await writeFile(
			resolve(root, "apps/leaf/contracts/fixture.pdf"),
			"original fixture",
		);
		await writeFile(
			resolve(root, "apps/leaf-lab/source.ts"),
			"original runtime",
		);
		const original = await fingerprint(root);
		await writeFile(resolve(root, "apps/leaf-lab/source.ts"), "new runtime");
		expect((await fingerprint(root)).sha256).toBe(original.sha256);
		await writeFile(
			resolve(root, "apps/leaf/contracts/fixture.pdf"),
			"changed fixture",
		);
		expect((await fingerprint(root)).sha256).not.toBe(original.sha256);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("coverage distinguishes active assertions from vacuous perfect panels", () => {
	expect(
		assertionCoverage(
			[{ type: "api.called", calls: [{ toolName: "attach" }] }],
			{
				"Expected API calls": 0,
				"Expected tool calls": 1,
				"Preview before create schedule": 1,
			},
		),
	).toMatchObject({
		declaredExpectationCount: 1,
		activeScorers: ["Expected API calls"],
		activePassed: 0,
		inactivePerfect: 1,
		otherScorers: ["Preview before create schedule"],
	});
	expect(assertionCoverage(undefined, { "Expected API calls": 1 })).toBeNull();
	expect(
		assertionCoverage({
			apiCalls: [{ toolName: "attach" }, { toolName: "previewAttach" }],
		})?.declaredExpectationCount,
	).toBe(2);
});

test("report preserves multiple scored cases and missing-score failures", async () => {
	const root = await mkdtemp(resolve(tmpdir(), "leaf-report-"));
	try {
		const good = resolve(root, "good");
		const failed = resolve(root, "failed");
		await mkdir(good);
		await mkdir(failed);
		await writeFile(
			resolve(root, "manifest.json"),
			JSON.stringify({
				status: "completed-with-failures",
				invocations: [
					{ directory: good, processDurationMs: 9000 },
					{ directory: failed, status: "failed" },
				],
			}),
		);
		await writeFile(
			resolve(good, "scores.json"),
			JSON.stringify({
				results: [
					{
						metadata: { caseName: "a", caseId: "experiment:1" },
						scores: { correct: 1 },
					},
					{
						metadata: {},
						input: { caseId: "experiment:0" },
						scores: { correct: 0 },
						error: {},
					},
				],
			}),
		);
		await writeFile(
			resolve(good, "100-opus.json"),
			JSON.stringify({
				name: "experiment:0",
				measurements: [
					{ kind: "turn_started", turnType: "user", turnIndex: 1 },
					{ kind: "approval_ready", elapsedMs: 12 },
					{ kind: "repair" },
				],
				proposalAttempts: 2,
			}),
		);
		const report = await buildReport(root);
		expect(report.invocations[0].cases).toHaveLength(2);
		expect(
			report.invocations[0].driverRuns[0].cumulativeBackendApprovalReadyMs,
		).toBe(12);
		expect(report.invocations[0].driverRuns[0].proposalAttempts).toBe(2);
		expect(report.invocations[1].scoreArtifactError).toBeDefined();
		expect(
			report.invocations[0].cases[0].cumulativeBackendApprovalReadyMs,
		).toBeNull();
		expect(
			report.invocations[0].cases[1].cumulativeBackendApprovalReadyMs,
		).toBe(12);
		expect(report.invocations[0].cases[1].timingEvidence).toEqual([
			"100-opus.json",
		]);
		expect(report.invocations[0].cases[1].caseId).toBe("experiment:0");
		expect(report.invocations[0].cases[1].status).toBe("error");
		expect(report.invocations[0].cases[1].error).toEqual({});
		const markdown = await readFile(resolve(root, "report.md"), "utf8");
		expect(markdown).toContain("Inactive perfect panels");
		expect(markdown).toContain("correct = 0");
		expect(markdown).toContain(
			"Error present; message lost during serialization",
		);
		const comparison = compareReports(report, report);
		expect(comparison.attempts).toHaveLength(6);
		expect(
			comparison.pairs.every((pair) => !pair.latencyComparisonEligible),
		).toBe(true);
		const successful = structuredClone(report);
		successful.corpusProvenance = {
			classification: "corrected",
			corpusFingerprint: "same-corpus",
		};
		successful.invocations[0].cases[0].firstReadiness = firstReadiness([
			{ kind: "turn_started", turnType: "user" },
			{ kind: "approval_ready", elapsedMs: 100 },
		]);
		const faster = structuredClone(successful);
		faster.invocations[0].cases[0].firstReadiness.firstApprovalReadyMs = 50;
		expect(
			compareReports(successful, faster).pairs.find(
				(pair) => pair.caseId === "experiment:1",
			)?.speedup,
		).toBe(2);
		faster.invocations[0].cases[0].status = "failed";
		expect(
			compareReports(successful, faster).pairs.find(
				(pair) => pair.caseId === "experiment:1",
			)?.latencyComparisonEligible,
		).toBe(false);
		const unknown = structuredClone(successful);
		unknown.corpusProvenance = { classification: "legacy-unlabeled" };
		expect(compareReports(unknown, successful).provenance.status).toBe(
			"unknown-no-speedups",
		);
		expect(
			compareReports(unknown, successful).pairs.every(
				(pair) => pair.speedup === null,
			),
		).toBe(true);
		const mismatched = structuredClone(successful);
		mismatched.corpusProvenance.corpusFingerprint = "different-corpus";
		expect(() => compareReports(successful, mismatched)).toThrow(
			"Corpus fingerprints differ",
		);
		const mixed = structuredClone(successful);
		for (const invocation of mixed.invocations) {
			invocation.arm = "opus";
			invocation.corpusFingerprint = "same-corpus";
		}
		const challenger = structuredClone(mixed.invocations[0]);
		challenger.arm = "jev";
		challenger.id = "challenger";
		mixed.invocations.push(challenger);
		const replay = structuredClone(challenger);
		replay.id = "challenger-replay";
		replay.retryOf = "challenger";
		mixed.invocations.push(replay);
		expect(() => compareReports(mixed, mixed)).toThrow("one arm");
		const filtered = compareReports(mixed, mixed, {
			beforeArm: "opus",
			afterArm: "jev",
		});
		expect(
			filtered.attempts.filter((attempt) => attempt.side === "before"),
		).toHaveLength(3);
		expect(
			filtered.attempts.filter((attempt) => attempt.side === "after"),
		).toHaveLength(4);
		expect(
			filtered.attempts
				.filter((attempt) => attempt.side === "after")
				.every((attempt) => attempt.arm === "jev"),
		).toBe(true);
		expect(filtered.provenance.status).toBe("verified-identical-corpus");
		expect(() =>
			compareReports(successful, successful, { beforeArm: "flash" }),
		).toThrow("No flash");
		replay.corpusFingerprint = "drifted";
		expect(() =>
			compareReports(mixed, mixed, { beforeArm: "opus", afterArm: "jev" }),
		).toThrow("Invocation corpus fingerprint");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
