import type { Store } from "hono-rate-limiter";
import { getMiscRedis } from "@/external/redis/initRedis.js";

// Same key prefix and expiry as @hono-rate-limiter/redis, so pairs share its counters.
const KEY_PREFIX = "hrl:";
const INCREMENT_ORG_THEN_CUSTOMER = `
local function hit(key, windowMs)
	local hits = redis.call("INCR", key)
	local ttl = redis.call("PTTL", key)
	if ttl <= 0 then
		redis.call("PEXPIRE", key, windowMs)
		ttl = windowMs
	end
	return { hits, ttl }
end
local org = hit(KEYS[1], tonumber(ARGV[1]))
if org[1] > tonumber(ARGV[2]) and ARGV[3] ~= "1" then
	return org
end
local customer = hit(KEYS[2], tonumber(ARGV[4]))
return { org[1], org[2], customer[1], customer[2] }
`;

type HitResult = { totalHits: number; resetTime: Date };

let scriptSha: Promise<string> | undefined;
const loadScript = () =>
	getMiscRedis().script("LOAD", INCREMENT_ORG_THEN_CUSTOMER) as Promise<string>;

const runScript = async (keys: string[], args: (string | number)[]) => {
	scriptSha ??= loadScript();
	const call = async () =>
		getMiscRedis().evalsha(await scriptSha!, keys.length, ...keys, ...args);
	try {
		return (await call()) as number[];
	} catch {
		scriptSha = loadScript();
		return (await call()) as number[];
	}
};

const toHitResult = ({
	hits,
	ttl,
}: {
	hits: number;
	ttl: number;
}): HitResult => ({
	totalHits: hits,
	resetTime: new Date(Date.now() + ttl),
});

/** One round trip: count the org key, then the customer key unless the org is over its cap. */
export const incrementOrgThenCustomer = async ({
	org,
	customer,
	countCustomerOverOrgLimit,
}: {
	org: { key: string; windowMs: number; limit: number };
	customer: { key: string; windowMs: number };
	countCustomerOverOrgLimit: boolean;
}): Promise<{ org: HitResult; customer?: HitResult }> => {
	const reply = await runScript(
		[`${KEY_PREFIX}${org.key}`, `${KEY_PREFIX}${customer.key}`],
		[
			org.windowMs,
			org.limit,
			countCustomerOverOrgLimit ? "1" : "0",
			customer.windowMs,
		],
	);
	const [orgHits, orgTtl, customerHits, customerTtl] = reply.map(Number);
	return {
		org: toHitResult({ hits: orgHits, ttl: orgTtl }),
		customer:
			reply.length === 4
				? toHitResult({ hits: customerHits, ttl: customerTtl })
				: undefined,
	};
};

/** A store answering with a hit already counted in Redis; un-counting still goes to Redis. */
export const createCountedHitStore = ({
	key,
	hit,
}: {
	key: string;
	hit: HitResult;
}): Store => ({
	increment: async () => hit,
	decrement: async () => {
		await getMiscRedis().decr(`${KEY_PREFIX}${key}`);
	},
	resetKey: async () => {
		await getMiscRedis().del(`${KEY_PREFIX}${key}`);
	},
});
