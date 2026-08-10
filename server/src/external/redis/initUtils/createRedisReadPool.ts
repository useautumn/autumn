import type { Redis } from "ioredis";

const REDIS_READ_POOL = Symbol("redisReadPool");

const LISTENER_METHODS = new Set([
	"addListener",
	"off",
	"on",
	"once",
	"prependListener",
	"removeAllListeners",
	"removeListener",
]);

type RedisReadPoolState = {
	lanes: readonly [Redis, Redis];
	inFlight: [number, number];
};

export type RedisReadLaneLease = {
	redis: Redis;
	release: () => void;
};

const getRedisReadPoolState = (redis: Redis): RedisReadPoolState | undefined =>
	(Reflect.get(redis, REDIS_READ_POOL) as RedisReadPoolState | undefined) ??
	undefined;

export const getRedisReadPoolLanes = (redis: Redis): readonly Redis[] =>
	getRedisReadPoolState(redis)?.lanes ?? [redis];

export const acquireRedisReadLane = (
	redis: Redis,
): RedisReadLaneLease | undefined => {
	const state = getRedisReadPoolState(redis);
	if (!state) return undefined;

	const readyIndexes = state.lanes
		.map((lane, index) => ({ lane, index }))
		.filter(({ lane }) => lane.status === "ready")
		.map(({ index }) => index);
	const candidateIndexes = readyIndexes.length > 0 ? readyIndexes : [0, 1];
	let selectedIndex = candidateIndexes[0] ?? 0;

	// Ties go to the highest lane: lane 0 also carries every unpooled op
	// (writes, readMaster), so idle pooled reads defect to the quiet lane.
	for (const candidateIndex of candidateIndexes.slice(1)) {
		if (state.inFlight[candidateIndex] <= state.inFlight[selectedIndex]) {
			selectedIndex = candidateIndex;
		}
	}

	state.inFlight[selectedIndex] += 1;
	let released = false;
	return {
		redis: state.lanes[selectedIndex],
		release: () => {
			if (released) return;
			released = true;
			state.inFlight[selectedIndex] -= 1;
		},
	};
};

export const createRedisReadPool = ({
	lanes,
}: {
	lanes: readonly [Redis, Redis];
}): Redis => {
	const state: RedisReadPoolState = {
		lanes,
		inFlight: [0, 0],
	};
	const laneZero = lanes[0];
	const onceWrappers = new Map<
		(...args: unknown[]) => void,
		(...args: unknown[]) => void
	>();
	let proxy: Redis;

	const fanOutListener = (property: string) => {
		if (property === "once") {
			return (event: string, handler: (...args: unknown[]) => void) => {
				let fired = false;
				const wrapped = (...args: unknown[]) => {
					if (fired) return;
					fired = true;
					for (const lane of lanes) lane.off(event, wrapped);
					onceWrappers.delete(handler);
					handler(...args);
				};
				onceWrappers.set(handler, wrapped);
				for (const lane of lanes) lane.once(event, wrapped);
				return proxy;
			};
		}

		return (...args: unknown[]) => {
			const handler = args[1] as ((...inner: unknown[]) => void) | undefined;
			const wrapped = handler && onceWrappers.get(handler);
			const effective = wrapped ? [args[0], wrapped, ...args.slice(2)] : args;
			if (wrapped) onceWrappers.delete(handler);

			for (const lane of lanes) {
				Reflect.apply(Reflect.get(lane, property, lane), lane, effective);
			}
			return proxy;
		};
	};

	proxy = new Proxy(laneZero, {
		get(target, property) {
			if (property === REDIS_READ_POOL) return state;
			if (property === "disconnect") {
				return (...args: unknown[]) => {
					for (const lane of lanes) {
						Reflect.apply(lane.disconnect, lane, args);
					}
				};
			}
			if (property === "quit") {
				return async (...args: unknown[]) => {
					const [result] = await Promise.all(
						lanes.map((lane) => Reflect.apply(lane.quit, lane, args)),
					);
					return result;
				};
			}
			if (typeof property === "string" && LISTENER_METHODS.has(property)) {
				return fanOutListener(property);
			}

			const value = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
		set(target, property, value) {
			return Reflect.set(target, property, value, target);
		},
		has(target, property) {
			return property === REDIS_READ_POOL || Reflect.has(target, property);
		},
		getPrototypeOf(target) {
			return Reflect.getPrototypeOf(target);
		},
	});

	return proxy;
};
