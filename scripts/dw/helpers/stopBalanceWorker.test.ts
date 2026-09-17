import { expect, test } from "bun:test";
import { stopBalanceWorker } from "./stopBalanceWorker.ts";

async function startListener(): Promise<{
	port: number;
	process: ReturnType<typeof Bun.spawn>;
}> {
	const child = Bun.spawn(
		[
			process.execPath,
			"-e",
			`const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ok") });
process.stdout.write(String(server.port) + "\\n");
process.once("SIGTERM", async () => {
	await Bun.sleep(50);
	await server.stop();
	process.exit(0);
});
await new Promise(() => {});`,
		],
		{ stdout: "pipe", stderr: "inherit" },
	);
	const reader = child.stdout.getReader();
	const firstChunk = await reader.read();
	reader.releaseLock();
	const port = Number(new TextDecoder().decode(firstChunk.value).trim());
	if (!Number.isInteger(port) || port <= 0) throw new Error("No listener port");
	return { port, process: child };
}

test("stops an existing worker with SIGTERM and waits for its port", async () => {
	const listener = await startListener();
	await stopBalanceWorker({ port: listener.port, worktreeNum: 999 });
	expect(await listener.process.exited).toBe(0);
});

test("returns when no worker is listening", async () => {
	await expect(
		stopBalanceWorker({ port: 59_999, worktreeNum: 999 }),
	).resolves.toBeUndefined();
});
