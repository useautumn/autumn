import type { Subprocess } from "bun";

const RESTART_DELAY_MS = 2_000;

let isStopping = false;
let worker: Subprocess | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		isStopping = true;
		worker?.kill(signal);
	});
}

while (!isStopping) {
	worker = Bun.spawn(["bun", "run", "dev"], {
		stdio: ["inherit", "inherit", "inherit"],
	});
	const exitCode = await worker.exited;
	if (isStopping || exitCode === 0) break;
	console.error(
		`Balance worker exited with code ${exitCode}; restarting in ${RESTART_DELAY_MS / 1000}s`,
	);
	await Bun.sleep(RESTART_DELAY_MS);
}
