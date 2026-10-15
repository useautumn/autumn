import { expect, test } from "bun:test";

const CYCLES = 10;

type Sample = { cycle: number | "end"; threads: number; rssMb: number };

/** In its own process, so a thread left behind by stop() shows up as a process that never exits. */
test(
	"the producer thread starts and stops repeatedly and the process still exits on its own",
	async () => {
		const child = Bun.spawn(
			["bun", new URL("./producerThreadCycles.ts", import.meta.url).pathname],
			{
				env: { ...process.env, PRODUCER_THREAD_CYCLES: String(CYCLES) },
				stdout: "pipe",
				stderr: "inherit",
			},
		);
		const exited = await Promise.race([
			child.exited,
			Bun.sleep(120_000).then(() => "hung" as const),
		]);
		if (exited === "hung") child.kill("SIGKILL");
		const samples = (await new Response(child.stdout).text())
			.split("\n")
			.filter((line) => line.startsWith('{"t"'))
			.map((line) => JSON.parse(line) as Sample);
		expect(exited).toBe(0);
		const baseline = samples[0];
		const end = samples.at(-1);
		expect(end?.cycle).toBe("end");
		// Each stopped thread stays parked (unref'd, never terminated): about one OS thread per cycle.
		expect((end?.threads ?? 0) - baseline.threads).toBeLessThanOrEqual(
			2 * CYCLES,
		);
	},
	{ timeout: 150_000 },
);
