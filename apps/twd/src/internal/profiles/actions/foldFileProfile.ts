import type { FileStats } from "@tw/worker/runTestFileWithStats.ts";
import type { FileProfile } from "../types/fileProfile.ts";
import type { FileProfileSample } from "../types/fileProfileSample.ts";
import {
	MEAN_METRICS,
	PEAK_METRICS,
	type ProfileMetrics,
} from "../types/profileMetrics.ts";

const MEAN_ALPHA = 0.3;
const PEAK_UP_ALPHA = 0.5;
const PEAK_DOWN_ALPHA = 0.15;
const FAIL_ALPHA = 0.1;

export const statsToProfileMetrics = (stats: FileStats): ProfileMetrics => ({
	stripeRequests: stats.stripe?.requests ?? null,
	stripeTestRequests: stats.stripe?.testRequests ?? null,
	stripeServerRequests: stats.stripe?.serverRequests ?? null,
	stripeMeanRps: stats.stripe?.meanRps ?? null,
	stripeMeanInFlight: stats.stripe?.meanInFlight ?? null,
	rateLimited: stats.stripe?.rateLimited ?? null,
	permitWaitMs: stats.stripe?.permitWaitMs ?? null,
	cpuCoreSeconds: stats.cpu.coreSeconds,
	testCpuSeconds: stats.cpu.testProcessSeconds,
	stripePeakRps: stats.stripe?.peakRps ?? null,
	stripePeakInFlight: stats.stripe?.peakInFlight ?? null,
	workerPeakRps: stats.stripe?.machinePeakRps ?? null,
	workerPeakInFlight: stats.stripe?.machinePeakInFlight ?? null,
	permitWaitP95Ms: stats.stripe?.permitWaitP95Ms ?? null,
	cpuPeakCores: stats.cpu.peakCores,
	memPeakMib: stats.mem.peakMib,
	testPeakMib: stats.mem.testProcessPeakMib,
});

const mean = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length;

const present = (values: (number | null)[]) =>
	values.filter((value): value is number => value !== null);

/** A repeat run counts once: means are averaged, peaks keep the worst repetition. */
export const combineRunSamples = (
	samples: FileProfileSample[],
): FileProfileSample => {
	const withMetrics = samples.flatMap(({ metrics }) =>
		metrics ? [metrics] : [],
	);
	const metrics =
		withMetrics.length === 0
			? null
			: (Object.fromEntries([
					...MEAN_METRICS.map((name) => {
						const values = present(withMetrics.map((m) => m[name]));
						return [name, values.length > 0 ? mean(values) : null];
					}),
					...PEAK_METRICS.map((name) => {
						const values = present(withMetrics.map((m) => m[name]));
						return [name, values.length > 0 ? Math.max(...values) : null];
					}),
				]) as ProfileMetrics);
	return {
		durationMs: mean(samples.map(({ durationMs }) => durationMs)),
		failure: mean(samples.map(({ failure }) => failure)),
		hung: samples.some(({ hung }) => hung),
		metrics,
	};
};

const smooth = ({
	previous,
	value,
	alpha,
}: {
	previous: number | null | undefined;
	value: number | null;
	alpha: number;
}) => {
	if (value === null) return previous ?? null;
	if (previous === null || previous === undefined) return value;
	return previous + alpha * (value - previous);
};

const smoothPeak = ({
	previous,
	value,
}: {
	previous: number | null | undefined;
	value: number | null;
}) =>
	smooth({
		previous,
		value,
		alpha:
			value !== null && value > (previous ?? 0)
				? PEAK_UP_ALPHA
				: PEAK_DOWN_ALPHA,
	});

/** EW mean and variance of duration; a hung sample can only raise the mean. */
const foldDuration = ({
	previous,
	sample,
}: {
	previous: FileProfile | undefined;
	sample: FileProfileSample;
}) => {
	if (!previous)
		return { durationMeanMs: sample.durationMs, durationVariance: 0 };
	const mu = previous.durationMeanMs;
	const value = sample.hung
		? Math.max(mu, sample.durationMs)
		: sample.durationMs;
	const alpha = sample.hung ? PEAK_UP_ALPHA : MEAN_ALPHA;
	const diff = value - mu;
	const increment = alpha * diff;
	return {
		durationMeanMs: mu + increment,
		durationVariance:
			(1 - alpha) * ((previous.durationVariance ?? 0) + diff * increment),
	};
};

/** Folds one run's sample into a file's rolling profile. */
export const foldFileProfile = ({
	previous,
	sample,
	file,
	workerClass,
	runId,
}: {
	previous: FileProfile | undefined;
	sample: FileProfileSample;
	file: string;
	workerClass: string;
	runId: string;
}): FileProfile => {
	const metrics = sample.metrics;
	const smoothedMetrics = Object.fromEntries([
		...MEAN_METRICS.map((name) => [
			name,
			smooth({
				previous: previous?.[name],
				value: metrics?.[name] ?? null,
				alpha: MEAN_ALPHA,
			}),
		]),
		...PEAK_METRICS.map((name) => [
			name,
			smoothPeak({
				previous: previous?.[name],
				value: metrics?.[name] ?? null,
			}),
		]),
	]) as ProfileMetrics;
	return {
		file,
		workerClass,
		samples: (previous?.samples ?? 0) + 1,
		statsSamples: (previous?.statsSamples ?? 0) + (metrics ? 1 : 0),
		...foldDuration({ previous, sample }),
		failRate:
			smooth({
				previous: previous?.failRate,
				value: sample.failure,
				alpha: FAIL_ALPHA,
			}) ?? 0,
		...smoothedMetrics,
		lastRunId: runId,
		updatedAt: new Date(),
	};
};
