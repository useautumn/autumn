import type { RunSizing } from "../../../../api/contract.ts";
import type { FileProfileEstimate } from "../../../profiles/types/fileProfileEstimate.ts";
import {
	HEADROOM,
	LOAD_SIGMA,
	MAX_AUTO_FILES_PER_WORKER,
	OVERHEAD_QUANTILE,
} from "./sizingConstants.ts";

type Limits = RunSizing["limits"];
type Load = NonNullable<RunSizing["load"]>;
type Resource = keyof Load;
const RESOURCES: Resource[] = [
	"stripeRps",
	"stripeInFlight",
	"cores",
	"memoryMib",
];

/** One file's measured load at one file per worker; cores and memory are worker-wide. */
type FileLoad = {
	file: string;
	stripeRps: number;
	stripeInFlight: number;
	workerCores: number;
	workerMemoryMib: number;
	testMemoryMib: number;
};

const quantile = (values: number[], q: number) => {
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
	);
};

const meanAndSigma = (values: number[]) => {
	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	const variance =
		values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
	return { mean, sigma: Math.sqrt(variance) };
};

const toFileLoad = ({
	file,
	estimate,
}: {
	file: string;
	estimate: FileProfileEstimate | null | undefined;
}): FileLoad | null => {
	if (estimate?.source !== "file") return null;
	const { metrics, durationMs } = estimate;
	const values = [
		metrics.stripeMeanRps,
		metrics.stripeMeanInFlight,
		metrics.cpuCoreSeconds,
		metrics.memPeakMib,
	];
	if (values.some((value) => value === null) || durationMs <= 0) return null;
	return {
		file,
		stripeRps: metrics.stripeMeanRps ?? 0,
		stripeInFlight: metrics.stripeMeanInFlight ?? 0,
		workerCores: (metrics.cpuCoreSeconds ?? 0) / (durationMs / 1000),
		workerMemoryMib: metrics.memPeakMib ?? 0,
		testMemoryMib: metrics.testPeakMib ?? 0,
	};
};

/** Idle-stack overhead (server, Postgres, Dragonfly) is the light end of worker-wide CPU and memory. */
const measureOverhead = (loads: FileLoad[]): Load => ({
	stripeRps: 0,
	stripeInFlight: 0,
	cores: quantile(
		loads.map((l) => l.workerCores),
		OVERHEAD_QUANTILE,
	),
	memoryMib: quantile(
		loads.map((l) => l.workerMemoryMib - l.testMemoryMib),
		OVERHEAD_QUANTILE,
	),
});

const fileIncrement = ({
	load,
	overhead,
}: {
	load: FileLoad;
	overhead: Load;
}): Load => ({
	stripeRps: load.stripeRps,
	stripeInFlight: load.stripeInFlight,
	cores: Math.max(0, load.workerCores - overhead.cores),
	memoryMib: Math.max(
		load.testMemoryMib,
		load.workerMemoryMib - overhead.memoryMib,
	),
});

/** Expected per-worker load of k co-scheduled files: overhead + k·μ + 2σ·√k. */
const loadAt = ({
	k,
	increments,
	overhead,
}: {
	k: number;
	increments: Load[];
	overhead: Load;
}): Load =>
	Object.fromEntries(
		RESOURCES.map((resource) => {
			const { mean, sigma } = meanAndSigma(increments.map((i) => i[resource]));
			return [
				resource,
				overhead[resource] + k * mean + LOAD_SIGMA * Math.sqrt(k) * sigma,
			];
		}),
	) as Load;

const ceilingOf = ({ limits }: { limits: Limits }): Load => ({
	stripeRps: HEADROOM * limits.stripeRps,
	stripeInFlight: HEADROOM * limits.stripeInFlight,
	cores: HEADROOM * limits.cores,
	memoryMib: HEADROOM * limits.memoryMib,
});

const firstOverCeiling = ({ load, ceiling }: { load: Load; ceiling: Load }) =>
	RESOURCES.find((resource) => load[resource] > ceiling[resource]) ?? null;

/** A file that alone takes over half of what a worker can share is never packed. */
const isHeavy = ({
	increment,
	overhead,
	ceiling,
}: {
	increment: Load;
	overhead: Load;
	ceiling: Load;
}) =>
	RESOURCES.some(
		(resource) =>
			increment[resource] > (ceiling[resource] - overhead[resource]) / 2,
	);

/** Largest k whose expected load fits every ceiling; profiled, light, non-solo files pack. */
export const chooseFilesPerWorker = ({
	files,
	estimates,
	soloCandidates,
	limits,
}: {
	files: string[];
	estimates: Map<string, FileProfileEstimate | null>;
	soloCandidates: Set<string>;
	limits: Limits;
}): {
	filesPerWorker: number;
	packable: Set<string>;
	load: Load | null;
	binding: string | null;
	reasons: string[];
} => {
	const loads = files.flatMap((file) => {
		if (soloCandidates.has(file)) return [];
		const load = toFileLoad({ file, estimate: estimates.get(file) });
		return load ? [load] : [];
	});
	const unprofiled = files.length - soloCandidates.size - loads.length;
	if (loads.length < 2)
		return {
			filesPerWorker: 1,
			packable: new Set(),
			load: null,
			binding: null,
			reasons: [
				`${loads.length} file(s) have Stripe/CPU/memory profiles; packing needs at least 2`,
			],
		};

	const overhead = measureOverhead(loads);
	const ceiling = ceilingOf({ limits });
	const withIncrements = loads.map((load) => ({
		load,
		increment: fileIncrement({ load, overhead }),
	}));
	const light = withIncrements.filter(
		({ increment }) => !isHeavy({ increment, overhead, ceiling }),
	);
	const increments = light.map(({ increment }) => increment);
	const reasons = [
		`${light.length} packable, ${withIncrements.length - light.length} heavy, ${soloCandidates.size} org-mutating, ${Math.max(0, unprofiled)} without profiles (heavy, org-mutating and unprofiled run alone)`,
		`overhead per worker: ${overhead.cores.toFixed(2)} cores, ${Math.round(overhead.memoryMib)} MiB`,
	];
	if (light.length < 2)
		return {
			filesPerWorker: 1,
			packable: new Set(),
			load: null,
			binding: null,
			reasons,
		};

	let filesPerWorker = 1;
	let binding: string | null = null;
	for (let k = 2; k <= MAX_AUTO_FILES_PER_WORKER; k++) {
		binding = firstOverCeiling({
			load: loadAt({ k, increments, overhead }),
			ceiling,
		});
		if (binding) break;
		filesPerWorker = k;
	}
	const load = loadAt({ k: filesPerWorker, increments, overhead });
	reasons.push(
		binding
			? `${filesPerWorker + 1} files per worker would push ${binding} over ${HEADROOM * 100}% of its ceiling`
			: `${filesPerWorker} files per worker is the cap`,
	);
	return {
		filesPerWorker,
		packable:
			filesPerWorker > 1
				? new Set(light.map(({ load: l }) => l.file))
				: new Set(),
		load,
		binding,
		reasons,
	};
};
