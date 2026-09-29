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

const skipSteps = new Set([
	"Set up job",
	"Set up runner",
	"Complete runner",
	"Complete job",
]);
const groups: Record<string, Record<string, number[]>> = {};

for (const job of jobs) {
	const [kind, , provider] = job.name.split(" ");
	if (job.conclusion !== "success")
		console.warn(`${job.name}: ${job.conclusion}`);
	const key = `${kind} ${provider}`;
	groups[key] ??= {};
	const group = groups[key];
	const record = (metric: string, value: number) => {
		group[metric] ??= [];
		group[metric].push(value);
	};
	for (const step of job.steps) {
		if (skipSteps.has(step.name) || step.name.startsWith("Post ")) continue;
		record(step.name, secs(step.started_at, step.completed_at));
	}
	record("total", secs(job.started_at, job.completed_at));
}

const pct = (xs: number[], p: number) => {
	const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
	return s.length
		? s[Math.min(s.length - 1, Math.floor(p * s.length))]
		: Number.NaN;
};

const rows = Object.entries(groups)
	.sort(([a], [b]) => a.localeCompare(b))
	.flatMap(([group, metrics]) =>
		Object.entries(metrics).map(([metric, values]) => ({
			group,
			metric,
			n: values.length,
			min: pct(values, 0),
			median: pct(values, 0.5),
			max: pct(values, 1),
		})),
	);
console.table(rows);
