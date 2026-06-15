// Live Daytona sandbox-LAYER smoke — exercises the DaytonaNetworkSandboxSession
// contract (create → run → file I/O → spawn → preview URL → snapshot → delete)
// directly, without the full harness/MCP/DB stack. Proves the SDK mapping.
//
// Spins a REAL Daytona sandbox (costs) — run manually. Needs DAYTONA_API_KEY.
//   infisical run --env=dev -- bun apps/leaf/tests/harness/daytonaLayer.smoke.ts
import { initInfisical } from "@autumn/shared/utils/infisical";

await initInfisical();

const { daytonaClient } = await import("../../src/providers/daytona/client.js");
const { buildDaytonaNetworkSession } = await import(
	"../../src/providers/daytona/session.js"
);
const { DAYTONA_BRIDGE_PORT } = await import(
	"../../src/providers/daytona/config.js"
);

// biome-ignore lint/suspicious/noConsole: smoke-test output.
const log = (label: string, value: unknown) =>
	console.log(`[daytona-smoke] ${label}:`, value);

const main = async () => {
	const daytona = daytonaClient();
	log("creating sandbox", "node:24 (public)");
	const sandbox = await daytona.create(
		{ image: "node:24", public: true, autoStopInterval: 5 },
		{ timeout: 300 },
	);
	log("sandbox id", sandbox.id);

	try {
		const session = await buildDaytonaNetworkSession({
			sandbox,
			ownsLifecycle: true,
		});
		log("defaultWorkingDirectory", session.defaultWorkingDirectory);

		const node = await session.run({ command: "node --version" });
		log("run node --version", node);

		const dir = session.defaultWorkingDirectory;
		await session.writeTextFile({
			path: `${dir}/probe.txt`,
			content: "hello daytona\nsecond line\n",
		});
		const readBack = await session.readTextFile({ path: `${dir}/probe.txt` });
		log("readTextFile probe.txt", readBack);
		const sliced = await session.readTextFile({
			path: `${dir}/probe.txt`,
			startLine: 2,
			endLine: 2,
		});
		log("readTextFile lines 2-2", sliced);

		// Spawn a short background process; confirm stdout streaming + wait().
		const proc = await session.spawn({
			command: "for i in 1 2 3; do echo line-$i; sleep 1; done",
		});
		const collected: string[] = [];
		const reader = proc.stdout.getReader();
		const decoder = new TextDecoder();
		const drain = (async () => {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (value) collected.push(decoder.decode(value));
			}
		})();
		const exit = await proc.wait();
		await drain;
		log("spawn exit", exit);
		log("spawn stdout", collected.join("").trim());

		// A bridge binds a port and the harness reaches it via the preview URL.
		const httpsUrl = await session.getPortUrl({ port: DAYTONA_BRIDGE_PORT });
		const wsUrl = await session.getPortUrl({
			port: DAYTONA_BRIDGE_PORT,
			protocol: "ws",
		});
		log("getPortUrl https", httpsUrl);
		log("getPortUrl ws", wsUrl);

		log("creating snapshot", "daytona-smoke-snapshot");
		await sandbox
			._experimental_createSnapshot(`daytona-smoke-${Date.now()}`)
			.then(() => log("snapshot", "created"))
			.catch((error) => log("snapshot FAILED (non-fatal)", String(error)));

		// biome-ignore lint/suspicious/noConsole: smoke-test result output.
		console.log("\n===== DAYTONA LAYER SMOKE: PASS =====\n");
	} finally {
		log("deleting sandbox", sandbox.id);
		await sandbox.delete().catch(() => undefined);
	}
	process.exit(0);
};

main().catch((error) => {
	// biome-ignore lint/suspicious/noConsole: smoke-test failure output.
	console.error("[daytona-smoke] FAILED", error);
	process.exit(1);
});
