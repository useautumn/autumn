import type { EvalResultWithSummary } from "braintrust";

export const FAIL_ON_SCORE_ENV = "EVAL_FAIL_ON_SCORE";

type CaseFailure = { caseName: string; reasons: string[] };

const caseNameOf = (metadata: unknown): string => {
	const record = metadata as Record<string, unknown> | null | undefined;
	const name = record?.caseName;
	return typeof name === "string" ? name : "(unnamed case)";
};

export const evalFailures = (
	evaluation: Pick<
		EvalResultWithSummary<unknown, unknown, unknown, Record<string, unknown>>,
		"results"
	>,
): CaseFailure[] =>
	evaluation.results.flatMap((result) => {
		const reasons = [
			...(result.error ? [`error: ${String(result.error)}`] : []),
			...Object.entries(result.scores).flatMap(([name, score]) =>
				score === null || score < 1 ? [`${name}: ${score ?? "null"}`] : [],
			),
		];
		return reasons.length
			? [{ caseName: caseNameOf(result.metadata), reasons }]
			: [];
	});

/** Opt-in (CI) gate: a scorer below 1 or a thrown case fails the process,
 * since `Eval()` itself always resolves cleanly. */
export const assertEvalPassed = ({
	evaluation,
	experimentName,
}: {
	evaluation: Pick<
		EvalResultWithSummary<unknown, unknown, unknown, Record<string, unknown>>,
		"results"
	>;
	experimentName: string;
}) => {
	if (!process.env[FAIL_ON_SCORE_ENV]) return;
	const failures = evalFailures(evaluation);
	if (!failures.length) return;
	const lines = failures.map(
		({ caseName, reasons }) => `  ${caseName}\n    ${reasons.join("\n    ")}`,
	);
	console.error(`[eval] ${experimentName} failed:\n${lines.join("\n")}`);
	process.exitCode = 1;
};

/** The whole run failed before scoring (e.g. the evaluator timed out). */
export const failEvalRun = ({
	error,
	experimentName,
}: {
	error: unknown;
	experimentName?: string;
}) => {
	if (!process.env[FAIL_ON_SCORE_ENV]) return;
	console.error(`[eval] ${experimentName ?? "eval"} failed: ${String(error)}`);
	process.exitCode = 1;
};
