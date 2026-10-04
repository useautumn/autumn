/**
 * Bytes and CPU per sync-track stage, per track-alloc arm. Each stage runs in its own process under
 * `BUN_JSC_logGC=1`, at n and 2n iterations; the difference of the logged allocation divided by n
 * cancels the unlogged tail of the last cycle.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const stages = (args.stages ?? "parse,decide,encode,reply").split(",");
const arms = (args.arms ?? "A,B").split(",");
const iterations = Number(args.iterations ?? 20_000);
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
			env: { ...process.env, NODE_ENV: "production", BUN_JSC_logGC: "1" },
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
