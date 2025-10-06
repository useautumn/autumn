#!/usr/bin/env node

import { getProcessOnPort, killProcess } from "./detect-ports.js";

const PORTS_TO_CHECK = [3000, 3001, 8080, 8081, 8082, 8083];

async function cleanupPorts() {
	console.log("🧹 Cleaning up dev server ports...\n");

	let killedCount = 0;

	for (const port of PORTS_TO_CHECK) {
		const processInfo = await getProcessOnPort(port);

		if (processInfo) {
			const { pid, processName } = processInfo;

			// Check if it's a dev server process
			const isDevProcess =
				processName.includes("bun") ||
				processName.includes("node") ||
				processName.includes("vite");

			if (isDevProcess) {
				console.log(`⚠️  Port ${port}: ${processName} (PID: ${pid})`);
				const killed = await killProcess(pid);

				if (killed) {
					console.log(`   ✅ Killed process ${pid}\n`);
					killedCount++;
				} else {
					console.log(`   ❌ Failed to kill process ${pid}\n`);
				}
			} else {
				console.log(
					`ℹ️  Port ${port}: ${processName} (PID: ${pid}) - skipping (not a dev server)\n`,
				);
			}
		}
	}

	if (killedCount === 0) {
		console.log("✨ No dev server processes found on common ports");
	} else {
		console.log(`✅ Cleaned up ${killedCount} process(es)`);
	}
}

cleanupPorts().catch((error) => {
	console.error("Error cleaning up ports:", error);
	process.exit(1);
});
