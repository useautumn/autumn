import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";

/** The deployment's service name: alien resolves it to every replica's address on the deployment network. */
export const PEER_SERVICE_NAME = "atom.svc";
/** Replica addresses change only when a replica is replaced, so a resolution is kept this long. */
const RESOLVE_EVERY_MS = 5_000;

export const ownAddresses = (): string[] =>
	Object.values(networkInterfaces())
		.flat()
		.filter((iface) => iface && !iface.internal && iface.family === "IPv4")
		.map((iface) => iface!.address);

/** The other replicas' addresses, resolved on demand and kept for a while; none when the name does not resolve. */
export const createPeerResolver = ({
	serviceName = PEER_SERVICE_NAME,
	now = Date.now,
}: {
	serviceName?: string;
	now?: () => number;
} = {}) => {
	let known: string[] = [];
	let resolvedAt = 0;
	let resolving: Promise<string[]> | null = null;

	async function resolve(): Promise<string[]> {
		const own = new Set(ownAddresses());
		try {
			const records = await lookup(serviceName, { all: true });
			known = records.map((r) => r.address).filter((a) => !own.has(a));
		} catch {
			known = [];
		}
		resolvedAt = now();
		return known;
	}

	return {
		async peers(): Promise<string[]> {
			if (now() - resolvedAt < RESOLVE_EVERY_MS) return known;
			resolving ??= resolve().finally(() => {
				resolving = null;
			});
			return resolving;
		},
		/** After a failed delivery: the peer may be gone, so the next relay resolves again. */
		forget(): void {
			resolvedAt = 0;
		},
	};
};
