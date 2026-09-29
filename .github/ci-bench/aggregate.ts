// Usage: bun .github/ci-bench/aggregate.ts <run_id>
import { $ } from "bun";

const runId = process.argv[2];
if (!runId) throw new Error("usage: aggregate.ts <run_id>");

type Step = {
	name: string;
	started_at: string | null;
	completed_at: string | null;
};
type Job = {
	name: string;
	conclusion: string | null;
	created_at: string;
	started_at: string;
	completed_at: string | null;
	steps: Step[];
};

const pages =
	await $`gh api --paginate repos/useautumn/autumn/actions/runs/${runId}/jobs?per_page=100 --jq .jobs[]`.text();
const jobs: Job[] = pages
	.trim()
	.split("\n")
	.filter(Boolean)
	.map((l) => JSON.parse(l));

const secs = (a: string | null, b: string | null) =>
	a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : Number.NaN;

const metrics = [
	"Checkout code",
	"Set up Bun",
	"Install dependencies",
	"Run unit tests",
	"total",
];
const byProvider: Record<string, Record<string, number[]>> = {};

for (const job of jobs) {
	const provider = job.name.split(" ").at(-1) ?? "unknown";
	if (job.conclusion !== "success")
		console.warn(`${job.name}: ${job.conclusion}`);
	byProvider[provider] ??= Object.fromEntries(metrics.map((m) => [m, []]));
	const bucket = byProvider[provider];
	bucket.total.push(secs(job.started_at, job.completed_at));
	for (const step of job.steps) {
		if (bucket[step.name])
			bucket[step.name].push(secs(step.started_at, step.completed_at));
	}
}

const pct = (xs: number[], p: number) => {
	const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
	return s.length
		? s[Math.min(s.length - 1, Math.floor(p * s.length))]
		: Number.NaN;
};

const rows = Object.entries(byProvider).flatMap(([provider, bucket]) =>
	metrics.map((metric) => ({
		provider,
		metric,
		n: bucket[metric].length,
		min: pct(bucket[metric], 0),
		median: pct(bucket[metric], 0.5),
		p90: pct(bucket[metric], 0.9),
		max: pct(bucket[metric], 1),
	})),
);
console.table(rows);
