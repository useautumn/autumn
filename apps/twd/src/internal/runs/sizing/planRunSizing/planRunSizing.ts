import type { RunSizing } from "../../../../api/contract.ts";
import type { FileProfileEstimate } from "../../../profiles/types/fileProfileEstimate.ts";
import {
	MAIN_SHARD,
	type SizingShard,
	SOLO_SHARD,
} from "../types/sizingShard.ts";
import type { SwarmSizing } from "../types/swarmSizing.ts";
import { chooseFilesPerWorker } from "./chooseFilesPerWorker.ts";
import { sizeShardWorkers } from "./sizeShardWorkers.ts";
import {
	HEADROOM,
	LEARNED_SOLO_MARGIN,
	SLOT_SAFETY,
	WALL_SLACK,
} from "./sizingConstants.ts";

type Limits = Omit<RunSizing["limits"], "headroom">;
type Plan = { sizing: RunSizing; swarm: SwarmSizing };

const ONE_PER_FILE: SwarmSizing = {
	filesPerWorker: 1,
	soloFiles: [],
	shardWorkers: null,
};

const countFiles = (shards: SizingShard[]) =>
	shards.reduce((sum, shard) => sum + shard.files.length, 0);

const baseSizing = ({
	mode,
	workers,
	limits,
	reasons,
}: {
	mode: RunSizing["mode"];
	workers: number;
	limits: Limits;
	reasons: string[];
}): RunSizing => ({
	mode,
	filesPerWorker: 1,
	workers,
	packedFiles: 0,
	soloFiles: 0,
	targetWallMs: null,
	predictedWallMs: null,
	limits: { headroom: HEADROOM, ...limits },
	load: null,
	binding: null,
	reasons,
});

const hasLearnedToRunAlone = (
	estimate: FileProfileEstimate | null | undefined,
) =>
	estimate?.packedFailRate != null &&
	estimate.packedFailRate > estimate.failRate + LEARNED_SOLO_MARGIN;

/** Main shard split into packed files and files that must run alone; capability shards stay as they are. */
const splitMainShard = ({
	shards,
	packable,
}: {
	shards: SizingShard[];
	packable: Set<string>;
}): SizingShard[] =>
	shards.flatMap((shard) =>
		shard.key === MAIN_SHARD
			? [
					{
						key: MAIN_SHARD,
						files: shard.files.filter((f) => packable.has(f)),
					},
					{
						key: SOLO_SHARD,
						files: shard.files.filter((f) => !packable.has(f)),
					},
				]
			: [shard],
	);

/**
 * Worker count and files per worker for a run. Manual caps keep today's one-file-per-worker
 * model; Auto packs profiled, light, non-org-mutating files and sizes each shard by LPT.
 */
export const planRunSizing = ({
	maxWorkers,
	maxFilesPerWorker,
	repeat,
	shards,
	estimates,
	staticSolo,
	workerCap,
	limits,
}: {
	maxWorkers?: number | null;
	maxFilesPerWorker?: number | null;
	repeat: number;
	/** Pooled shards with test ids: "main" plus one per capability set. */
	shards: SizingShard[];
	estimates: Map<string, FileProfileEstimate | null>;
	/** Files whose source mutates org-wide state. */
	staticSolo: Set<string>;
	/** Usable keys × accounts per key, bounded by the run ceiling. */
	workerCap: number;
	limits: Limits;
}): Plan => {
	const totalFiles = countFiles(shards);
	if (maxWorkers)
		return {
			sizing: baseSizing({
				mode: "max_workers",
				workers: Math.min(totalFiles, maxWorkers, workerCap),
				limits,
				reasons: [`max workers ${maxWorkers}: one file per worker`],
			}),
			swarm: ONE_PER_FILE,
		};

	const mainFiles = shards.find((s) => s.key === MAIN_SHARD)?.files ?? [];
	const learnedSolo = new Set(
		mainFiles.filter((file) => hasLearnedToRunAlone(estimates.get(file))),
	);
	const soloCandidates = new Set([...staticSolo, ...learnedSolo]);

	if (maxFilesPerWorker && maxFilesPerWorker > 1) {
		const packable = new Set(mainFiles.filter((f) => !soloCandidates.has(f)));
		const split = splitMainShard({ shards, packable });
		const shardWorkers = Object.fromEntries(
			split.map((shard) => [
				shard.key,
				Math.min(
					Math.ceil(
						shard.files.length /
							(shard.key === MAIN_SHARD ? maxFilesPerWorker : 1),
					),
					shard.maxWorkers ?? Number.POSITIVE_INFINITY,
				),
			]),
		);
		const workers = Object.values(shardWorkers).reduce((a, b) => a + b, 0);
		return {
			sizing: {
				...baseSizing({
					mode: "max_files_per_worker",
					workers: Math.min(workers, workerCap),
					limits,
					reasons: [
						`max files per worker ${maxFilesPerWorker}: ${packable.size} files packed, ${soloCandidates.size} org-mutating or learned-solo files alone`,
					],
				}),
				filesPerWorker: maxFilesPerWorker,
				packedFiles: packable.size,
				soloFiles: mainFiles.length - packable.size,
			},
			swarm: {
				filesPerWorker: maxFilesPerWorker,
				soloFiles: mainFiles.filter((f) => !packable.has(f)),
				shardWorkers,
			},
		};
	}

	const allFiles = shards.flatMap((shard) => shard.files);
	if (!allFiles.some((file) => estimates.get(file)))
		return {
			sizing: baseSizing({
				mode: "auto",
				workers: Math.min(totalFiles, workerCap),
				limits,
				reasons: ["no file profiles yet: one worker per file, as before"],
			}),
			swarm: ONE_PER_FILE,
		};

	const choice =
		repeat > 1
			? {
					filesPerWorker: 1,
					packable: new Set<string>(),
					load: null,
					binding: null,
					reasons: ["repeat run: repetitions share ids, so one per worker"],
				}
			: chooseFilesPerWorker({
					files: mainFiles,
					estimates,
					soloCandidates,
					limits: { headroom: HEADROOM, ...limits },
				});
	const k = choice.filesPerWorker;
	const sized =
		k > 1 ? splitMainShard({ shards, packable: choice.packable }) : shards;

	const p90 = (file: string) => estimates.get(file)?.durationP90Ms ?? 0;
	const targetWallMs = WALL_SLACK * Math.max(0, ...allFiles.map(p90));
	const perShard = sized.map((shard) => ({
		shard,
		...sizeShardWorkers({
			durations: shard.files.map(p90),
			failRates: shard.files.map((f) => estimates.get(f)?.failRate ?? 0),
			filesPerWorker: shard.key === MAIN_SHARD ? k : 1,
			targetMs: targetWallMs,
			maxWorkers: shard.maxWorkers,
		}),
	}));
	const workers = perShard.reduce((sum, { workers: w }) => sum + w, 0);
	const soloFiles =
		k > 1 ? mainFiles.filter((f) => !choice.packable.has(f)) : [];
	return {
		sizing: {
			mode: "auto",
			filesPerWorker: k,
			workers: Math.min(workers, workerCap),
			packedFiles: k > 1 ? choice.packable.size : 0,
			soloFiles: soloFiles.length,
			targetWallMs: Math.round(targetWallMs),
			predictedWallMs: Math.round(
				Math.max(0, ...perShard.map(({ makespanMs }) => makespanMs)),
			),
			limits: { headroom: HEADROOM, ...limits },
			load: choice.load,
			binding: choice.binding,
			reasons: [
				...choice.reasons,
				`${learnedSolo.size} file(s) learned to run alone from packed failures`,
				`workers sized so longest-first finishes within ${WALL_SLACK}× the longest file p90 (${Math.round(targetWallMs / 1000)}s), ×${SLOT_SAFETY} safety, plus 1.5× expected retries: ${perShard
					.map(({ shard, workers: w }) => `${shard.key} ${w}`)
					.join(", ")}`,
				...(workers > workerCap
					? [`capped at ${workerCap} by usable keys`]
					: []),
			],
		},
		swarm: {
			filesPerWorker: k,
			soloFiles,
			shardWorkers: Object.fromEntries(
				perShard.map(({ shard, workers: w }) => [shard.key, w]),
			),
		},
	};
};
