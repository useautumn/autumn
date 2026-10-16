/** What every driver mode does first: the Autumn stub up, the tenant on both replicas, and every customer seeded. */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { rigConfig } from "./rigConfig.js";

const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");

export const log = (message: string) =>
	console.log(`[${new Date().toISOString()}] ${message}`);

export const until = async (what: string, ready: () => Promise<boolean>) => {
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline) {
		if (await ready().catch(() => false)) return;
		await Bun.sleep(500);
	}
	throw new Error(`${what} was not ready within 120 s`);
};

export const startStubAndSeed = async ({
	replicaUrls,
}: {
	replicaUrls: string[];
}) => {
	const config = rigConfig;
	const stub = Bun.spawn(
		[
			process.execPath,
			join(import.meta.dir, "rigAutumn.ts"),
			replicaUrls.join(","),
		],
		{ stdout: "inherit", stderr: "inherit" },
	);
	process.on("exit", () => stub.kill());
	const stubUrl = `http://127.0.0.1:${config.stub.port}`;
	await until(
		"The Autumn stub",
		async () => (await fetch(`${stubUrl}/__rig/stats`)).ok,
	);
	for (const url of replicaUrls)
		await until(url, async () => (await fetch(`${url}/health`)).status === 200);

	for (const url of replicaUrls) {
		const reply = await fetch(`${url}/v1/atoms.put`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-atom-admin-token": config.tenant.adminToken,
			},
			body: JSON.stringify({
				id: config.tenant.atomId,
				token_hash: sha256(config.tenant.token),
			}),
		});
		if (!reply.ok)
			throw new Error(
				`atoms.put on ${url}: ${reply.status} ${await reply.text()}`,
			);
	}
	log(`tenant ${config.tenant.atomId} registered on ${replicaUrls.join(", ")}`);

	const seededAt = Date.now();
	const seeded = await (
		await fetch(`${stubUrl}/__rig/seed`, { method: "POST" })
	).json();
	log(
		`seeded ${seeded.seeded} customers in ${((Date.now() - seededAt) / 1000).toFixed(1)} s`,
	);
	await Bun.sleep(5_000);
	return { stub, stubUrl };
};
