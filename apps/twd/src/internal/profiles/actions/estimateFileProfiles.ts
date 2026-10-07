import { dirname } from "node:path";
import { splitRepetitionId } from "../../runs/repeat/repetitions.ts";
import type { FileProfile } from "../types/fileProfile.ts";
import type { FileProfileEstimate } from "../types/fileProfileEstimate.ts";
import {
	MEAN_METRICS,
	PEAK_METRICS,
	type ProfileMetrics,
} from "../types/profileMetrics.ts";

/** A folder stands in for its unprofiled files only once it has this many profiled ones. */
const MIN_FOLDER_PROFILES = 5;
const FULL_CONFIDENCE_SAMPLES = 3;
const P90_Z = 1.28;
const METRIC_NAMES = [...MEAN_METRICS, ...PEAK_METRICS];

const quantile = (values: number[], q: number) => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const ancestorFolders = (file: string) => {
	const folders: string[] = [];
	for (
		let folder = dirname(file);
		folder !== "." && folder !== "/";
		folder = dirname(folder)
	)
		folders.push(folder);
	return folders;
};

const durationP90 = (profile: FileProfile) =>
	profile.durationMeanMs + P90_Z * Math.sqrt(profile.durationVariance ?? 0);

const ownEstimate = (profile: FileProfile): FileProfileEstimate => ({
	source: "file",
	folder: null,
	confidence: Math.min(1, profile.samples / FULL_CONFIDENCE_SAMPLES),
	durationMs: profile.durationMeanMs,
	durationP90Ms: durationP90(profile),
	failRate: profile.failRate ?? 0,
	packedFailRate: profile.packedFailRate ?? null,
	metrics: Object.fromEntries(
		METRIC_NAMES.map((name) => [name, profile[name] ?? null]),
	) as ProfileMetrics,
});

/** Duration at durationQuantile, every resource at its p75: unknown files are assumed heavier than typical. */
const groupEstimate = ({
	profiles,
	source,
	folder,
	durationQuantile,
}: {
	profiles: FileProfile[];
	source: "folder" | "global";
	folder: string | null;
	durationQuantile: number;
}): FileProfileEstimate => {
	const at = (values: (number | null | undefined)[], q: number) =>
		quantile(
			values.filter((value): value is number => typeof value === "number"),
			q,
		);
	return {
		source,
		folder,
		confidence: 0,
		durationMs:
			at(
				profiles.map((p) => p.durationMeanMs),
				durationQuantile,
			) ?? 0,
		durationP90Ms: at(profiles.map(durationP90), durationQuantile) ?? 0,
		failRate:
			at(
				profiles.map((p) => p.failRate),
				0.75,
			) ?? 0,
		packedFailRate: null,
		metrics: Object.fromEntries(
			METRIC_NAMES.map((name) => [
				name,
				at(
					profiles.map((p) => p[name]),
					0.75,
				),
			]),
		) as ProfileMetrics,
	};
};

/** Pure: per-file estimates with cold start falling back to the nearest profiled folder, then the suite. */
export const estimateFileProfiles = ({
	files,
	profiles,
}: {
	files: string[];
	profiles: FileProfile[];
}): Map<string, FileProfileEstimate | null> => {
	const byFile = new Map(profiles.map((profile) => [profile.file, profile]));
	const byFolder = new Map<string, FileProfile[]>();
	for (const profile of profiles)
		for (const folder of ancestorFolders(profile.file)) {
			const folderProfiles = byFolder.get(folder) ?? [];
			folderProfiles.push(profile);
			byFolder.set(folder, folderProfiles);
		}
	const folderEstimates = new Map<string, FileProfileEstimate>();
	const global =
		profiles.length > 0
			? groupEstimate({
					profiles,
					source: "global",
					folder: null,
					durationQuantile: 0.75,
				})
			: null;

	const estimate = (id: string) => {
		const { file } = splitRepetitionId({ id });
		const own = byFile.get(file);
		if (own) return ownEstimate(own);
		const folder = ancestorFolders(file).find(
			(candidate) =>
				(byFolder.get(candidate)?.length ?? 0) >= MIN_FOLDER_PROFILES,
		);
		if (!folder) return global;
		const cached = folderEstimates.get(folder);
		if (cached) return cached;
		const fresh = groupEstimate({
			profiles: byFolder.get(folder) ?? [],
			source: "folder",
			folder,
			durationQuantile: 0.5,
		});
		folderEstimates.set(folder, fresh);
		return fresh;
	};
	return new Map(files.map((id) => [id, estimate(id)]));
};
