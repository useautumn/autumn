/**
 * Bytes and CPU per sync-track stage, per track-alloc arm. Each stage runs in its own process under
 * `BUN_JSC_logGC=1` with a small eden, so the loop's allocation is logged a MiB or so at a time; n and 2n iterations
 * are differenced so the unlogged tail of the last cycle cancels.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const stages = (args.stages ?? "parse,decide,encode,reply").split(",");
const arms = (args.arms ?? "A,B").split(",");
const iterations = Number(args.iterations ?? 5_000);
const ALLOCATED = /bytes allocated this cycle: (\d+)/g;

async function measure({
	stage,
	arm,
	count,
}: {
	stage: string;
	arm: string;
	count: number;
}): Promise<{ bytes: number; cpuUs: number }> {
	const child = Bun.spawn(
		[
			process.execPath,
			"--config=./bunfig.toml",
			`${import.meta.dir}/stage.ts`,
			stage,
			String(count),
			arm,
		],
		{
			env: {
				...process.env,
				NODE_ENV: "production",
				BUN_JSC_logGC: "1",
				BUN_JSC_largeHeapSize: "1048576",
				// Eden stays ~2% of the live heap whatever its size, so short loops still log.
				BUN_JSC_smallHeapGrowthFactor: "1.02",
				BUN_JSC_mediumHeapGrowthFactor: "1.02",
				BUN_JSC_largeHeapGrowthFactor: "1.02",
			},
			stdout: "ignore",
			stderr: "pipe",
		},
	);
	const log = await new Response(child.stderr).text();
	await child.exited;
	const loop = log.slice(log.indexOf("LOOP\n"));
	let bytes = 0;
	for (const match of loop.matchAll(ALLOCATED)) bytes += Number(match[1]);
	const done = /DONE (.*)/.exec(loop);
	if (!done?.[1])
		throw new Error(`${stage}/${arm} failed:\n${log.slice(-2000)}`);
	return { bytes, cpuUs: JSON.parse(done[1]).cpuUsPerIteration * count };
}

for (const stage of stages) {
	for (const arm of arms) {
		const once = await measure({ stage, arm, count: iterations });
		const twice = await measure({ stage, arm, count: iterations * 2 });
		console.log(
			JSON.stringify({
				stage,
				arm,
				bytesPerTrack: Math.round((twice.bytes - once.bytes) / iterations),
				cpuUsPerTrack: Number(
					((twice.cpuUs - once.cpuUs) / iterations).toFixed(2),
				),
			}),
		);
	}
}
