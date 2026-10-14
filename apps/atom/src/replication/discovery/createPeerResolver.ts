import { lookup } from "node:dns/promises";
import { networkInterfaces } from "node:os";

export const PEER_SERVICE_NAME = "atom.svc";
const RESOLVE_EVERY_MS = 5_000;

export type PeerResolver = {
	peers(): Promise<string[]>;
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
	peersFile?: string | null;
	serviceName?: string;
	resolve?: (name: string) => Promise<string[]>;
	own?: () => string[];
	now?: () => number;
};

const resolveWithDns = async (name: string): Promise<string[]> =>
	(await lookup(name, { all: true })).map((record) => record.address);

const readPeersFile = async (path: string): Promise<string[]> =>
	(await Bun.file(path).text())
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

export const createPeerResolver = ({
	ctx = {},
}: {
	ctx?: PeerResolverContext;
} = {}): PeerResolver => {
	const serviceName = ctx.serviceName ?? PEER_SERVICE_NAME;
	const resolve = ctx.resolve ?? resolveWithDns;
	const { peersFile } = ctx;
	const own = ctx.own ?? ownAddresses;
	const now = ctx.now ?? Date.now;
	let known: string[] = [];
	let resolvedAt = Number.NEGATIVE_INFINITY;
	let resolving: Promise<string[]> | null = null;

	async function refresh(): Promise<string[]> {
		const mine = new Set(own());
		try {
			const addresses = peersFile
				? await readPeersFile(peersFile)
				: await resolve(serviceName);
			known = addresses.filter((address) => !mine.has(address));
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
