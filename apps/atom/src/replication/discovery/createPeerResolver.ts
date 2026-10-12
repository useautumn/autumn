import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";

/** The deployment's service name: alien resolves it to every replica's address on the deployment network. */
export const PEER_SERVICE_NAME = "atom.svc";
/** Replica addresses change only when a replica is replaced, so a resolution is kept this long. */
const RESOLVE_EVERY_MS = 5_000;

export type PeerResolver = {
	peers(): Promise<string[]>;
	/** After a failed delivery: the peer may be gone, so the next call resolves again. */
	forget(): void;
};

export const ownAddresses = (): string[] =>
	Object.values(networkInterfaces())
		.flat()
		.filter(
			(iface) =>
				iface !== undefined && !iface.internal && iface.family === "IPv4",
		)
		.map((iface) => (iface as { address: string }).address);

type PeerResolverContext = {
	serviceName?: string;
	resolve?: (name: string) => Promise<string[]>;
	own?: () => string[];
	now?: () => number;
};

const resolveWithDns = async (name: string): Promise<string[]> =>
	(await lookup(name, { all: true })).map((record) => record.address);

/** The other replicas' addresses, resolved on demand and kept for a while; none while the name does not resolve. */
export const createPeerResolver = ({
	ctx = {},
}: {
	ctx?: PeerResolverContext;
} = {}): PeerResolver => {
	const serviceName = ctx.serviceName ?? PEER_SERVICE_NAME;
	const resolve = ctx.resolve ?? resolveWithDns;
	const own = ctx.own ?? ownAddresses;
	const now = ctx.now ?? Date.now;
	let known: string[] = [];
	let resolvedAt = Number.NEGATIVE_INFINITY;
	let resolving: Promise<string[]> | null = null;

	async function refresh(): Promise<string[]> {
		const mine = new Set(own());
		try {
			known = (await resolve(serviceName)).filter(
				(address) => !mine.has(address),
			);
		} catch {
			known = [];
		}
		resolvedAt = now();
		return known;
	}

	function peers(): Promise<string[]> {
		if (now() - resolvedAt < RESOLVE_EVERY_MS) return Promise.resolve(known);
		resolving ??= refresh().finally(() => {
			resolving = null;
		});
		return resolving;
	}

	return {
		peers,
		forget: () => {
			resolvedAt = Number.NEGATIVE_INFINITY;
		},
	};
};
