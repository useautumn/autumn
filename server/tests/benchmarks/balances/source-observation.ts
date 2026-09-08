import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import observationLua from "@/_luaScriptsV2/fullSubjectDeduction/balanceObservation.lua";
import deductionLua from "@/_luaScriptsV2/fullSubjectDeduction/deductFromSubjectBalances.lua";
import { DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT } from "@/_luaScriptsV2/luaScriptsV2.js";
import { createObservationFixture } from "../../integration/redis/source-observation/utils/observationFixture.js";

const baselineRef = process.env.BALANCE_OBSERVATION_BASELINE_REF;
if (!baselineRef || !process.env.BALANCE_OBSERVATION_TEST_REDIS_SOCKET)
	throw new Error(
		"Set BALANCE_OBSERVATION_BASELINE_REF and an isolated BALANCE_OBSERVATION_TEST_REDIS_SOCKET",
	);
const samples = Number(process.env.BALANCE_OBSERVATION_BENCH_SAMPLES ?? 5_000);
if (!Number.isSafeInteger(samples) || samples < 100 || samples > 20_000)
	throw new Error("Benchmark samples must be 100..20000");
const repository = resolve(import.meta.dir, "../../../..");
const previousMain = execFileSync(
	"git",
	[
		"show",
		`${baselineRef}:server/src/_luaScriptsV2/fullSubjectDeduction/deductFromSubjectBalances.lua`,
	],
	{ cwd: repository, encoding: "utf8" },
);
const baselineScript = DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT.replace(
	observationLua,
	"",
).replace(deductionLua, previousMain);
const fixture = createObservationFixture({ name: "benchmark" });
const modes = [
	{ name: "baseline", capture: false, script: baselineScript },
	{ name: "off", capture: false, script: DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT },
	{ name: "on", capture: true, script: DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT },
];
const commandMicros = async () =>
	Number(
		(await fixture.redis.info("commandstats")).match(
			/cmdstat_evalsha:calls=\d+,usec=(\d+)/,
		)?.[1] ?? 0,
	);
const percentile = ({
	values,
	percentile,
}: {
	values: number[];
	percentile: number;
}) =>
	values[Math.min(values.length - 1, Math.floor(values.length * percentile))];

try {
	console.log(
		JSON.stringify({
			baselineRef,
			samples,
			bun: Bun.version,
			redis: (await fixture.redis.info("server")).match(
				/redis_version:([^\r\n]+)/,
			)?.[1],
			scope:
				"Lua EVALSHA plus local socket, input building and JSON parsing; not HTTP or the TS capture policy",
		}),
	);
	for (const concurrency of [1, 32]) {
		for (let repetition = 0; repetition < 3; repetition++) {
			for (const mode of [
				...modes.slice(repetition),
				...modes.slice(0, repetition),
			]) {
				await fixture.reset();
				await fixture.seed({ balance: 1_000_000_000 });
				const sha = String(await fixture.redis.script("LOAD", mode.script));
				for (let index = 0; index < 200; index++)
					await fixture.run({
						capture: mode.capture,
						sha,
						requestId: `warm-${index}`,
						value: 1,
					});
				const latencies: number[] = [];
				let replyBytes = 0;
				const beforeMicros = await commandMicros();
				const startedAt = performance.now();
				for (let index = 0; index < samples; index += concurrency) {
					await Promise.all(
						Array.from(
							{ length: Math.min(concurrency, samples - index) },
							async (_, slot) => {
								const requestStartedAt = performance.now();
								const result = await fixture.run({
									capture: mode.capture,
									sha,
									requestId: `sample-${index + slot}`,
									value: 1,
								});
								latencies.push(performance.now() - requestStartedAt);
								if (result.error || (mode.capture && !result.observation))
									throw new Error(
										`Invalid benchmark result: ${JSON.stringify(result)}`,
									);
								replyBytes += Buffer.byteLength(JSON.stringify(result));
							},
						),
					);
				}
				const elapsedMs = performance.now() - startedAt;
				const luaMicros = ((await commandMicros()) - beforeMicros) / samples;
				latencies.sort((left, right) => left - right);
				const marker = fixture.markerKey({ requestId: "sample-0" });
				console.log(
					JSON.stringify({
						mode: mode.name,
						concurrency,
						repetition,
						p50Ms: percentile({ values: latencies, percentile: 0.5 }),
						p95Ms: percentile({ values: latencies, percentile: 0.95 }),
						p99Ms: percentile({ values: latencies, percentile: 0.99 }),
						requestsPerSecond: (samples * 1000) / elapsedMs,
						luaMicros,
						meanReplyBytes: replyBytes / samples,
						markerValueBytes: Buffer.byteLength(
							(await fixture.redis.get(marker))!,
						),
						markerMemoryBytes: await fixture.redis.call(
							"MEMORY",
							"USAGE",
							marker,
						),
						metadataMemoryBytes: await fixture.redis.call(
							"MEMORY",
							"USAGE",
							fixture.metadataKey,
						),
					}),
				);
			}
		}
	}
} finally {
	await fixture.close();
}
