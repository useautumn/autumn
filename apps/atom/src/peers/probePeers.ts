import { lookup } from "node:dns/promises";
import { hostname, networkInterfaces } from "node:os";

/** Spike diagnostics: who this replica is on the deployment network, and who else `atom.svc` names. */
export type PeerProbe = {
	hostname: string;
	addresses: string[];
	serviceName: string;
	resolved: string[] | { error: string };
	peers: {
		address: string;
		status: number | string;
		bootedAt: string | null;
		ms: number;
	}[];
};

const SERVICE_NAME = process.env.ATOM_PEER_SERVICE ?? "atom.svc";
const PORT = Number(process.env.ATOM_PORT ?? 8080);

export const ownAddresses = (): string[] =>
	Object.values(networkInterfaces())
		.flat()
		.filter((i) => i && !i.internal && i.family === "IPv4")
		.map((i) => i!.address);

export const probePeers = async (): Promise<PeerProbe> => {
	const own = ownAddresses();
	let resolved: string[] | { error: string };
	try {
		resolved = (await lookup(SERVICE_NAME, { all: true })).map(
			(r) => r.address,
		);
	} catch (error) {
		resolved = { error: String(error) };
	}
	const peers = Array.isArray(resolved)
		? resolved.filter((a) => !own.includes(a))
		: [];
	const probed = await Promise.all(
		peers.map(async (address) => {
			const t0 = performance.now();
			try {
				const res = await fetch(`http://${address}:${PORT}/health`, {
					signal: AbortSignal.timeout(2000),
				});
				const body = (await res.json()) as { bootedAt?: string };
				return {
					address,
					status: res.status,
					bootedAt: body.bootedAt ?? null,
					ms: Math.round(performance.now() - t0),
				};
			} catch (error) {
				return {
					address,
					status: String(error).slice(0, 80),
					bootedAt: null,
					ms: Math.round(performance.now() - t0),
				};
			}
		}),
	);
	return {
		hostname: hostname(),
		addresses: own,
		serviceName: SERVICE_NAME,
		resolved,
		peers: probed,
	};
};
