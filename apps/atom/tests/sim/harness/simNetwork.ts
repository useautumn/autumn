import type { SeededRandom, VirtualClock } from "./virtualClock.js";

export type NetworkProfile = {
	/** One-way delay, drawn per message; different draws reorder messages. */
	delayMs: [number, number];
	/** A request that never arrives: the sender sees a connection error after its delay. */
	dropRate: number;
	/** A request delivered twice, the second copy's answer discarded. */
	dupRate: number;
	/** A round trip past this is an abort for the sender, even when the request was applied. */
	timeoutMs: number;
	/** What the service name resolves to lags the real bindings by this much. */
	dnsLagMs: number;
	/** The balancer sends to an address it never saw before only after this many health checks' worth of time. */
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

/**
 * The deployment network as a seeded simulation: addresses bound to replica generations, messages delayed,
 * reordered, duplicated or lost by the profile, and a dead sender's promises never settling, as a killed process's would not.
 */
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
	/** When each address was first bound: a target the balancer has registered before takes traffic from its first listen. */
	const firstBound = new Map<string, number>();
	const history: { at: number; address: string; bound: boolean }[] = [];
	const observed: Observed[] = [];
	let current = profile;
	/** Addresses cut off from the others: nothing to or from them arrives, though they stay bound. */
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

	/** What the service name resolves to: the bindings as they stood `dnsLagMs` ago. */
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

	/** This endpoint's `fetch`: every request it makes crosses the simulated network. */
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
				// A check one replica hands another, to its owner or past its own start: never a relay of a push.
				proxied: from.id !== 0 && url.pathname === "/v1/balances.check",
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
		/** Where the balancer may send now: every bound address it has had time to register. */
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
		/** Cuts an address off from every other: its peers cannot reach it, nor it them. The balancer still can. */
		partition: ({ address }: { address: string }) => cutOff.add(address),
		heal: () => cutOff.clear(),
	};
};

export type SimNetwork = ReturnType<typeof createSimNetwork>;
