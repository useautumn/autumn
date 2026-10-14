import type { Subprocess } from "bun";

const RESTART_DELAY_MS = 2_000;

let isStopping = false;
let herald: Subprocess | undefined;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		isStopping = true;
		herald?.kill(signal);
	});
}

while (!isStopping) {
	herald = Bun.spawn(["bun", "run", "dev"], {
		stdio: ["inherit", "inherit", "inherit"],
	});
	const exitCode = await herald.exited;
	if (isStopping || exitCode === 0) break;
	console.error(
		`Herald exited with code ${exitCode}; restarting in ${RESTART_DELAY_MS / 1000}s`,
	);
	await Bun.sleep(RESTART_DELAY_MS);
}
