import type { SeededRandom, VirtualClock } from "./virtualClock.js";

export type NetworkProfile = {
	delayMs: [number, number];
	dropRate: number;
	dupRate: number;
	timeoutMs: number;
	dnsLagMs: number;
	balancerWarmMs: number;
};

export const QUIET_NETWORK: NetworkProfile = {
	delayMs: [1, 5],
	dropRate: 0,
	dupRate: 0,
	timeoutMs: 2_000,
	dnsLagMs: 0,
	balancerWarmMs: 20_000,
};

export type Endpoint = {
	id: number;
	address: string;
	alive: () => boolean;
	ready: () => boolean;
	request: (params: {
		port: number;
		path: string;
		init: RequestInit;
	}) => Promise<Response>;
};

export type Observed = {
	at: number;
	from: number;
	to: string;
	port: number;
	path: string;
	relayed: boolean;
	resend: boolean;
	proxied: boolean;
	body: string;
	outcome: "delivered" | "dropped" | "refused" | "timeout";
	toId?: number;
	targetReady?: boolean;
	status?: number;
	replyProxied?: boolean;
};

const never = new Promise<Response>(() => {});

export const createSimNetwork = ({
	clock,
	rng,
	profile,
}: {
	clock: VirtualClock;
	rng: SeededRandom;
	profile: NetworkProfile;
}) => {
	const bindings = new Map<string, Endpoint>();
	const firstBound = new Map<string, number>();
	const history: { at: number; address: string; bound: boolean }[] = [];
	const observed: Observed[] = [];
	let current = profile;
	const cutOff = new Set<string>();

	const bind = (endpoint: Endpoint) => {
		bindings.set(endpoint.address, endpoint);
		if (!firstBound.has(endpoint.address))
			firstBound.set(endpoint.address, clock.now());
		history.push({ at: clock.now(), address: endpoint.address, bound: true });
	};
	const unbind = (endpoint: Endpoint) => {
		if (bindings.get(endpoint.address)?.id !== endpoint.id) return;
		bindings.delete(endpoint.address);
		history.push({ at: clock.now(), address: endpoint.address, bound: false });
	};

	const resolve = async (): Promise<string[]> => {
		const asOf = clock.now() - current.dnsLagMs;
		const bound = new Set<string>();
		for (const event of history) {
			if (event.at > asOf) break;
			if (event.bound) bound.add(event.address);
			else bound.delete(event.address);
		}
		return [...bound].sort();
	};

	const deliver = async ({
		to,
		port,
		path,
		init,
		record,
	}: {
		to: string;
		port: number;
		path: string;
		init: RequestInit;
		record: Observed;
	}): Promise<Response> => {
		await clock.sleep(rng.int(current.delayMs[0], current.delayMs[1]));
		const target = bindings.get(to);
		if (!target || !target.alive()) {
			record.outcome = "refused";
			throw Object.assign(new TypeError(`connect ECONNREFUSED ${to}`), {
				code: "ECONNREFUSED",
			});
		}
		record.toId = target.id;
		record.targetReady = target.ready();
		const response = await target.request({ port, path, init });
		record.outcome = "delivered";
		record.status = response.status;
		record.replyProxied = response.headers.get("x-atom-proxied") !== null;
		await clock.sleep(rng.int(current.delayMs[0], current.delayMs[1]));
		return response;
	};

	const fetchFor = (from: Endpoint): typeof fetch => {
		const send = async (
			input: URL | RequestInfo,
			init: RequestInit = {},
		): Promise<Response> => {
			if (!from.alive()) return never;
			const url = new URL(
				typeof input === "string" ? input : (input as Request).url,
			);
			const headers = new Headers(init.headers);
			const record: Observed = {
				at: clock.now(),
				from: from.id,
				to: url.hostname,
				port: Number(url.port),
				path: url.pathname,
				relayed: headers.get("x-atom-relayed") === "1",
				resend: headers.get("x-atom-resend") === "1",
				proxied: headers.get("x-atom-proxied") === "1",
				body: typeof init.body === "string" ? init.body : "",
				outcome: "dropped",
			};
			observed.push(record);
			const sentAt = clock.now();
			const path = `${url.pathname}${url.search}`;
			const plain = { ...init, signal: undefined };
			const partitioned = cutOff.has(from.address) !== cutOff.has(url.hostname);
			if (partitioned || rng.chance(current.dropRate)) {
				await clock.sleep(rng.int(current.delayMs[0], current.delayMs[1]));
				if (!from.alive()) return never;
				throw Object.assign(
					new TypeError(`connect ETIMEDOUT ${url.hostname}`),
					{ code: "ETIMEDOUT" },
				);
			}
			if (rng.chance(current.dupRate))
				void deliver({
					to: url.hostname,
					port: Number(url.port),
					path,
					init: plain,
					record: { ...record },
				}).catch(() => {});
			let response: Response;
			try {
				response = await deliver({
					to: url.hostname,
					port: Number(url.port),
					path,
					init: plain,
					record,
				});
			} catch (error) {
				if (!from.alive()) return never;
				throw error;
			}
			if (!from.alive()) return never;
			if (clock.now() - sentAt > current.timeoutMs) {
				record.outcome = "timeout";
				throw new DOMException("The operation timed out", "TimeoutError");
			}
			return response;
		};
		return send as typeof fetch;
	};

	return {
		bind,
		unbind,
		resolve,
		fetchFor,
		observed,
		bound: () => [...bindings.keys()].sort(),
		routable: () =>
			[...bindings.keys()]
				.filter(
					(address) =>
						clock.now() - (firstBound.get(address) ?? 0) >=
						current.balancerWarmMs,
				)
				.sort(),
		setProfile: (next: Partial<NetworkProfile>) => {
			current = { ...current, ...next };
		},
		partition: ({ address }: { address: string }) => cutOff.add(address),
		heal: () => cutOff.clear(),
	};
};

export type SimNetwork = ReturnType<typeof createSimNetwork>;
