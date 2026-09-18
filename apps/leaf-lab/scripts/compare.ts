import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	buildReport,
	type firstReadiness,
	type providerCost,
} from "./report.js";

type Report = {
	status: string;
	corpusProvenance?: { classification?: string; corpusFingerprint?: string };
	invocations: Array<{
		id: string;
		retryOf?: string;
		target: string;
		repeat: number;
		arm: string;
		corpusFingerprint?: string;
		outcomeClassification: string;
		directory: string;
		providerCost: ReturnType<typeof providerCost>;
		cases?: Array<{
			caseId?: string;
			caseName: string;
			status: string;
			accuracyEligible: boolean;
			firstReadiness: ReturnType<typeof firstReadiness> | null;
			timingStatus: string;
			cumulativeBackendApprovalReadyMs: number | null;
			providerCost: ReturnType<typeof providerCost>;
			scores?: Record<string, number | null>;
		}>;
	}>;
};

type ArmFilters = { beforeArm?: string; afterArm?: string };

export function comparisonOptions(args: string[]) {
	if (args.length < 3)
		throw new Error(
			"Usage: compare.ts BEFORE_SUITE AFTER_SUITE OUTPUT_DIRECTORY [--before-arm opus --after-arm jev]",
		);
	const filters: ArmFilters = {};
	for (let index = 3; index < args.length; index += 2) {
		const flag = args[index];
		const arm = args[index + 1];
		if (!arm || !["opus", "jev", "flash"].includes(arm))
			throw new Error("Expected comparison arm opus, jev or flash");
		if (flag === "--before-arm" && filters.beforeArm === undefined)
			filters.beforeArm = arm;
		else if (flag === "--after-arm" && filters.afterArm === undefined)
			filters.afterArm = arm;
		else throw new Error(`Unknown or duplicate comparison option ${flag}`);
	}
	return {
		beforeDirectory: resolve(args[0] ?? ""),
		afterDirectory: resolve(args[1] ?? ""),
		output: resolve(args[2] ?? ""),
		filters,
	};
}

function selectArm(report: Report, arm: string | undefined) {
	const selected = {
		...report,
		invocations: arm
			? report.invocations.filter((invocation) => invocation.arm === arm)
			: report.invocations,
	};
	if (arm && !selected.invocations.length)
		throw new Error(`No ${arm} invocations found for selected comparison arm`);
	if (
		new Set(selected.invocations.map((invocation) => invocation.arm)).size > 1
	)
		throw new Error(
			"Each comparison side must contain one arm; use --before-arm and --after-arm for a mixed-arm suite",
		);
	const corpusFingerprint = report.corpusProvenance?.corpusFingerprint;
	if (
		corpusFingerprint &&
		selected.invocations.some(
			(invocation) =>
				invocation.corpusFingerprint &&
				invocation.corpusFingerprint !== corpusFingerprint,
		)
	)
		throw new Error(
			"Invocation corpus fingerprint differs from its suite; refusing comparison",
		);
	return selected;
}
const md = (value: unknown) =>
	String(value ?? "—")
		.replaceAll("|", "\\|")
		.replaceAll("\n", " ");
const time = (value: number | null | undefined) =>
	value == null ? "—" : `${(value / 1000).toFixed(2)} s`;

export function comparisonRows(before: Report, after: Report) {
	return (
		[
			{ side: "before", report: before },
			{ side: "after", report: after },
		] as const
	).flatMap(({ side, report }) =>
		report.invocations.flatMap((invocation) => {
			const common = {
				side,
				invocationId: String(invocation.id),
				retryOf: invocation.retryOf ?? null,
				target: String(invocation.target),
				repeat: Number(invocation.repeat),
				arm: String(invocation.arm),
				outcome: invocation.outcomeClassification,
				directory: String(invocation.directory),
			};
			if (!invocation.cases?.length)
				return [
					{
						...common,
						caseId: null as string | null,
						caseName: "No scored cases",
						scoreStatus: "unscored",
						accuracyEligible: false,
						firstApprovalReadyMs: null as number | null,
						timingBasis: "missing-case-evidence",
						userInputRequired: null as boolean | null,
						cumulativeBackendApprovalReadyMs: null as number | null,
						providerReportedCost: invocation.providerCost.reportedCost,
						providerRequests: invocation.providerCost.requests,
						providerRequestsWithCost:
							invocation.providerCost.requestsWithReportedCost,
						scores: {} as Record<string, number | null>,
					},
				];
			return invocation.cases.map((result) => ({
				...common,
				caseId: result.caseId ?? null,
				caseName: result.caseName,
				scoreStatus: result.status,
				accuracyEligible: result.accuracyEligible,
				firstApprovalReadyMs:
					result.firstReadiness?.firstApprovalReadyMs ?? null,
				timingBasis:
					result.firstReadiness?.firstApprovalTimingBasis ??
					result.timingStatus,
				userInputRequired:
					result.firstReadiness?.userInputRequiredBeforeApproval ?? null,
				cumulativeBackendApprovalReadyMs:
					result.cumulativeBackendApprovalReadyMs,
				providerReportedCost: result.providerCost.reportedCost,
				providerRequests: result.providerCost.requests,
				providerRequestsWithCost: result.providerCost.requestsWithReportedCost,
				scores: result.scores ?? {},
			}));
		}),
	);
}

export function compareReports(
	beforeInput: Report,
	afterInput: Report,
	filters: ArmFilters = {},
) {
	const before = selectArm(beforeInput, filters.beforeArm);
	const after = selectArm(afterInput, filters.afterArm);
	const beforeFingerprint = before.corpusProvenance?.corpusFingerprint;
	const afterFingerprint = after.corpusProvenance?.corpusFingerprint;
	if (
		beforeFingerprint &&
		afterFingerprint &&
		beforeFingerprint !== afterFingerprint
	)
		throw new Error(
			"Corpus fingerprints differ; refusing matched score/speedup comparison across different fixture sources",
		);
	const corpusVerified = Boolean(
		beforeFingerprint &&
			afterFingerprint &&
			beforeFingerprint === afterFingerprint,
	);
	const provenance = {
		status: corpusVerified
			? "verified-identical-corpus"
			: "unknown-no-speedups",
		before: before.corpusProvenance ?? { classification: "legacy-unlabeled" },
		after: after.corpusProvenance ?? { classification: "legacy-unlabeled" },
		note: corpusVerified
			? "The selected arms have identical recorded corpus fingerprints. Corpus labels are preserved separately."
			: "Corpus equivalence is unverified. Historical measurements and attempts are shown, but no matched speedups or identical-corrected-corpus claim is made.",
	};
	const attempts = comparisonRows(before, after);
	const groups = new Map<
		string,
		{
			caseId: string;
			target: string;
			repeat: number;
			before: typeof attempts;
			after: typeof attempts;
		}
	>();
	for (const attempt of attempts) {
		if (!attempt.caseId) continue;
		const key = JSON.stringify([
			attempt.target,
			attempt.caseId,
			attempt.repeat,
		]);
		let group = groups.get(key);
		if (!group) {
			group = {
				caseId: attempt.caseId,
				target: attempt.target,
				repeat: attempt.repeat,
				before: [],
				after: [],
			};
			groups.set(key, group);
		}
		group[attempt.side].push(attempt);
	}
	const pairs = [...groups.values()].map((group) => {
		const beforeAttempt = group.before.at(-1);
		const afterAttempt = group.after.at(-1);
		const eligible = Boolean(
			corpusVerified &&
				beforeAttempt &&
				afterAttempt &&
				beforeAttempt.accuracyEligible &&
				afterAttempt.accuracyEligible &&
				beforeAttempt.scoreStatus === "passed" &&
				afterAttempt.scoreStatus === "passed" &&
				beforeAttempt.firstApprovalReadyMs != null &&
				afterAttempt.firstApprovalReadyMs != null &&
				beforeAttempt.timingBasis === afterAttempt.timingBasis &&
				beforeAttempt.userInputRequired === afterAttempt.userInputRequired,
		);
		return {
			...group,
			beforeAttempt,
			afterAttempt,
			latencyComparisonEligible: eligible,
			speedup:
				eligible &&
				beforeAttempt?.firstApprovalReadyMs != null &&
				afterAttempt?.firstApprovalReadyMs &&
				afterAttempt.firstApprovalReadyMs > 0
					? beforeAttempt.firstApprovalReadyMs /
						afterAttempt.firstApprovalReadyMs
					: null,
		};
	});
	const costs = (
		[
			{ side: "before", report: before },
			{ side: "after", report: after },
		] as const
	).map(({ side, report }) => {
		const observed = report.invocations.flatMap((invocation) =>
			invocation.providerCost.reportedCost == null
				? []
				: [invocation.providerCost.reportedCost],
		);
		return {
			side,
			providerReportedCost: observed.length
				? observed.reduce((sum, cost) => sum + cost, 0)
				: null,
			capturedRequests: report.invocations.reduce(
				(sum, invocation) => sum + invocation.providerCost.requests,
				0,
			),
			requestsWithReportedCost: report.invocations.reduce(
				(sum, invocation) =>
					sum + invocation.providerCost.requestsWithReportedCost,
				0,
			),
		};
	});
	return {
		attempts,
		pairs,
		costs,
		provenance,
		selectedArms: {
			before: before.invocations[0]?.arm ?? null,
			after: after.invocations[0]?.arm ?? null,
		},
	};
}

export function toCsv(rows: Array<Record<string, unknown>>) {
	if (!rows.length) return "";
	const columns = Object.keys(rows[0] ?? {});
	const quote = (value: unknown) =>
		`"${String(value == null ? "" : typeof value === "object" ? JSON.stringify(value) : value).replaceAll('"', '""')}"`;
	return `${[
		columns.map(quote).join(","),
		...rows.map((row) => columns.map((column) => quote(row[column])).join(",")),
	].join("\n")}\n`;
}

export async function writeComparison(
	beforeDirectory: string,
	afterDirectory: string,
	output: string,
	filters: ArmFilters = {},
) {
	const repository = resolve(import.meta.dirname, "../../..");
	if (output === repository || output.startsWith(`${repository}/`))
		throw new Error("Comparison artifacts must be outside the repository");
	const before = await buildReport(beforeDirectory);
	const after =
		beforeDirectory === afterDirectory
			? before
			: await buildReport(afterDirectory);
	const result = compareReports(before, after, filters);
	await mkdir(output, { recursive: true, mode: 0o700 });
	await writeFile(
		resolve(output, "comparison.json"),
		JSON.stringify(
			{
				command: [process.execPath, ...process.argv.slice(1)],
				beforeDirectory,
				afterDirectory,
				beforeStatus: before.status,
				afterStatus: after.status,
				filters,
				...result,
			},
			null,
			2,
		),
		{ mode: 0o600 },
	);
	await writeFile(resolve(output, "attempts.csv"), toCsv(result.attempts), {
		mode: 0o600,
	});
	const markdown = [
		"# Leaf: before / after",
		"",
		`Before: ${md(before.status)}. After: ${md(after.status)}.`,
		`Selected arms: **${md(result.selectedArms.before)} → ${md(result.selectedArms.after)}**.`,
		`Provenance: **${md(result.provenance.status)}**. ${md(result.provenance.note)}`,
		`Corpus labels: ${md(result.provenance.before.classification)} → ${md(result.provenance.after.classification)}. Fingerprints: ${md(result.provenance.before.corpusFingerprint)} → ${md(result.provenance.after.corpusFingerprint)}.`,
		"",
		"## Matched cases (latest attempt, exact case ID and repeat)",
		"",
		"| Case | Repeat | Before outcome | After outcome | First ready before | First ready after | Timing basis | Valid speedup |",
		"| --- | ---: | --- | --- | ---: | ---: | --- | ---: |",
	];
	for (const pair of result.pairs)
		markdown.push(
			`| ${md(pair.caseId)} | ${pair.repeat} | ${md(pair.beforeAttempt?.scoreStatus)} / ${md(pair.beforeAttempt?.outcome)} | ${md(pair.afterAttempt?.scoreStatus)} / ${md(pair.afterAttempt?.outcome)} | ${time(pair.beforeAttempt?.firstApprovalReadyMs)} | ${time(pair.afterAttempt?.firstApprovalReadyMs)} | ${md(pair.beforeAttempt?.timingBasis)} → ${md(pair.afterAttempt?.timingBasis)}${pair.beforeAttempt?.userInputRequired || pair.afterAttempt?.userInputRequired ? "; user input required" : ""} | ${pair.latencyComparisonEligible && pair.speedup != null ? `${pair.speedup.toFixed(2)}×` : "not comparable"} |`,
		);
	markdown.push(
		"",
		"## Provider-reported cost, including failed and infrastructure attempts",
		"",
		"| Side | Reported usage.cost sum | Captured requests | Requests with reported cost |",
		"| --- | ---: | ---: | ---: |",
	);
	for (const cost of result.costs)
		markdown.push(
			`| ${cost.side} | ${md(cost.providerReportedCost)} | ${cost.capturedRequests} | ${cost.requestsWithReportedCost} |`,
		);
	markdown.push(
		"",
		"These are captured generative-provider usage.cost values, not inferred token prices or total system costs. Jev, scorer judges, missing usage and uncaptured requests are excluded; all captured per-request usage remains in report.json. Missing cost is unknown, never zero.",
		"",
		"## All attempts",
		"",
		"| Side | Invocation | Case | Outcome | Score status | First approval ready | Cumulative backend readiness (NOT first ready) |",
		"| --- | --- | --- | --- | --- | ---: | ---: |",
	);
	for (const attempt of result.attempts)
		markdown.push(
			`| ${attempt.side} | ${md(attempt.invocationId)} | ${md(attempt.caseId)} | ${md(attempt.outcome)} | ${md(attempt.scoreStatus)} | ${time(attempt.firstApprovalReadyMs)} | ${time(attempt.cumulativeBackendApprovalReadyMs)} |`,
		);
	markdown.push(
		"",
		"Only pairs that pass their case scorers, are accuracy-eligible and have matching measured first-ready timing bases receive speedups. Failed cases can contain an observed gate but are never latency successes. No-approval/read-only cases have no approval latency. Initial-turn gates use exact elapsedMs. Gates after clarification require fromFirstPromptMs; that measures scripted reply wall time without human waiting. Older multi-turn traces without that clock remain unavailable. Retained confirmations never move the first-ready marker. Process duration is never substituted. Every original infrastructure attempt and replay remains in attempts.csv and comparison.json.",
		"",
	);
	await writeFile(resolve(output, "comparison.md"), markdown.join("\n"), {
		mode: 0o600,
	});
	return result;
}

if (import.meta.main) {
	const options = comparisonOptions(process.argv.slice(2));
	await writeComparison(
		options.beforeDirectory,
		options.afterDirectory,
		options.output,
		options.filters,
	);
}
