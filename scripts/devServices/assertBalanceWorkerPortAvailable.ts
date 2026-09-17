import { createConnection } from "node:net";

export async function assertBalanceWorkerPortAvailable({
	port,
}: {
	port: number;
}): Promise<void> {
	function checkPort(
		resolve: (listening: boolean) => void,
		reject: (cause: unknown) => void,
	): void {
		const socket = createConnection({ host: "127.0.0.1", port });
		function onConnect(): void {
			socket.destroy();
			resolve(true);
		}
		function onError(cause: NodeJS.ErrnoException): void {
			socket.destroy();
			if (cause.code === "ECONNREFUSED") resolve(false);
			else reject(cause);
		}
		function onTimeout(): void {
			socket.destroy();
			reject(new Error(`Could not check balance worker port ${port}`));
		}
		socket.setTimeout(500);
		socket.once("connect", onConnect);
		socket.once("error", onError);
		socket.once("timeout", onTimeout);
	}
	const listening = await new Promise<boolean>(checkPort);
	if (listening)
		throw new Error(
			`Balance worker port ${port} is occupied. Stop the existing worker with SIGTERM and wait for its drain before restarting.`,
		);
}
