/** Per-file results from a shard's `bun test --reporter=junit` output, in the shape twd's /results/ingest takes. */
export type UnitFileResult = {
	file: string;
	status: "passed" | "failed" | "crashed" | "skipped";
	durationMs: number;
	passedTests: number;
	failedTests: number;
	failureSummary: string | null;
};

const MAX_FAILED_NAMES = 3;

const attr = ({ tag, name }: { tag: string; name: string }) =>
	tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

const unescapeXml = (text: string) =>
	text
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");

type Case = {
	file: string;
	name: string;
	seconds: number;
	outcome: "pass" | "fail" | "skip";
};

const parseTestCases = ({ xml }: { xml: string }): Case[] =>
	[...xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)].map(
		([, tag = "", body = ""]) => ({
			file: unescapeXml(attr({ tag, name: "file" }) ?? ""),
			name: unescapeXml(attr({ tag, name: "name" }) ?? ""),
			seconds: Number(attr({ tag, name: "time" }) ?? 0),
			outcome: /<(failure|error)\b/.test(body)
				? "fail"
				: /<skipped\b/.test(body)
					? "skip"
					: "pass",
		}),
	);

/**
 * A file with no test cases in a failed shard crashed before any test ran (e.g. an import error);
 * in a passing shard it is left out.
 */
export const junitFileResults = ({
	xml,
	paths,
	shardFailed,
}: {
	xml: string;
	paths: string[];
	shardFailed: boolean;
}): UnitFileResult[] => {
	const casesByFile = new Map<string, Case[]>();
	for (const c of parseTestCases({ xml }))
		casesByFile.set(c.file, [...(casesByFile.get(c.file) ?? []), c]);
	return paths.flatMap((file): UnitFileResult[] => {
		const cases = casesByFile.get(file) ?? [];
		if (cases.length === 0) {
			if (!shardFailed) return [];
			return [
				{
					file,
					status: "crashed",
					durationMs: 0,
					passedTests: 0,
					failedTests: 0,
					failureSummary:
						"No test reported: the file failed before its tests ran.",
				},
			];
		}
		const failed = cases.filter((c) => c.outcome === "fail");
		const passed = cases.filter((c) => c.outcome === "pass");
		return [
			{
				file,
				status:
					failed.length > 0
						? "failed"
						: passed.length > 0
							? "passed"
							: "skipped",
				durationMs: Math.round(
					cases.reduce((sum, c) => sum + c.seconds, 0) * 1000,
				),
				passedTests: passed.length,
				failedTests: failed.length,
				failureSummary:
					failed.length === 0
						? null
						: failed
								.slice(0, MAX_FAILED_NAMES)
								.map((c) => c.name)
								.join("; ")
								.slice(0, 1_000),
			},
		];
	});
};
