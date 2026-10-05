/**
 * MSK IAM speaks SASL over TLS. The test broker's SASL listener is plaintext, so this terminates TLS with a
 * throwaway self-signed certificate (made by openssl at test time) and pipes bytes to that listener.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:tls";

function selfSignedCertificate(): { key: string; cert: string } {
	const directory = mkdtempSync(join(tmpdir(), "producer-thread-tls-"));
	try {
		const keyPath = join(directory, "key.pem");
		const certPath = join(directory, "cert.pem");
		const made = Bun.spawnSync([
			"openssl",
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=127.0.0.1",
			"-keyout",
			keyPath,
			"-out",
			certPath,
		]);
		if (made.exitCode !== 0)
			throw new Error(`openssl failed: ${made.stderr.toString()}`);
		return {
			key: readFileSync(keyPath, "utf8"),
			cert: readFileSync(certPath, "utf8"),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

export async function startTlsBrokerProxy({
	target,
}: {
	target: { host: string; port: number };
}): Promise<{ address: string; stop(): Promise<void> }> {
	const sockets = new Set<Socket>();
	const server = createServer(selfSignedCertificate(), (client) => {
		const upstream = connect(target);
		sockets.add(client);
		sockets.add(upstream);
		client.pipe(upstream).pipe(client);
		client.on("error", () => upstream.destroy());
		upstream.on("error", () => client.destroy());
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as { port: number };
	return {
		address: `127.0.0.1:${port}`,
		async stop() {
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}
