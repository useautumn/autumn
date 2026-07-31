import { createHash } from "node:crypto";
import type { ListCustomersV2Params } from "@autumn/shared";
import { getPrimaryRedis } from "@/external/redis/initUtils/redisClientRegistry.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";

/**
 * OFFSET pagination costs O(offset): a request for offset 1.6M scans and
 * discards 1.6M rows before returning 250. Clients on API 2.2.0 have no cursor
 * to send, so we remember the position each page ended at and translate their
 * next offset into a keyset seek.
 *
 * Only helps sequential crawls, which is the pattern that hurts. A random-access
 * offset simply misses and takes the old path.
 */
export type OffsetCursor = { t: number; id: string };

/** Long enough to carry a crawl, short enough to bound how stale a position gets. */
const MEMO_TTL_SECONDS = 15 * 60;

/**
 * The position of "offset N" is only meaningful for one filter combination, so
 * every filter that changes the result set must be in the key. A collision here
 * serves one client another's page, which no error would surface — hence the
 * explicit field list rather than hashing the whole params object.
 */
const getFilterFingerprint = ({
	query,
}: {
	query: Pick<
		ListCustomersV2Params,
		"plans" | "processors" | "search" | "subscription_status"
	>;
}) => {
	const normalized = JSON.stringify({
		plans: (query.plans ?? [])
			.map((plan) => `${plan.id}:${(plan.versions ?? []).join(",")}`)
			.sort(),
		processors: [...(query.processors ?? [])].sort(),
		search: query.search?.trim() ?? "",
		subscriptionStatus: query.subscription_status ?? "",
	});

	return createHash("sha1").update(normalized).digest("hex").slice(0, 16);
};

const getMemoKey = ({
	ctx,
	query,
	offset,
}: {
	ctx: RequestContext;
	query: Parameters<typeof getFilterFingerprint>[0]["query"];
	offset: number;
}) =>
	`cusOffsetMemo:${ctx.org.id}:${ctx.env}:${getFilterFingerprint({ query })}:${offset}`;

/** Returns the position a previous page ended at, or null to fall back to OFFSET. */
export const getMemoizedOffsetCursor = async ({
	ctx,
	query,
	offset,
}: {
	ctx: RequestContext;
	query: Parameters<typeof getFilterFingerprint>[0]["query"];
	offset: number;
}): Promise<OffsetCursor | null> => {
	if (offset <= 0) return null;

	const raw = await tryRedisOp({
		operation: () =>
			getPrimaryRedis().get(getMemoKey({ ctx, query, offset })),
		source: "cus-offset-memo:get",
		redisInstance: getPrimaryRedis(),
	});
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as Partial<OffsetCursor>;
		if (typeof parsed.t !== "number" || typeof parsed.id !== "string") {
			return null;
		}
		return { t: parsed.t, id: parsed.id };
	} catch {
		// A memo miss is always safe — the caller just pays the OFFSET path.
		return null;
	}
};

/** Records where this page ended, keyed by the offset the next page will ask for. */
export const setMemoizedOffsetCursor = async ({
	ctx,
	query,
	nextOffset,
	lastRow,
}: {
	ctx: RequestContext;
	query: Parameters<typeof getFilterFingerprint>[0]["query"];
	nextOffset: number;
	lastRow: OffsetCursor;
}) => {
	await tryRedisOp({
		operation: () =>
			getPrimaryRedis().set(
				getMemoKey({ ctx, query, offset: nextOffset }),
				JSON.stringify(lastRow),
				"EX",
				MEMO_TTL_SECONDS,
			),
		source: "cus-offset-memo:set",
		redisInstance: getPrimaryRedis(),
		onError: (error) =>
			ctx.logger.warn(
				`[offsetCursorMemo] failed to store position for offset ${nextOffset}: ${error}`,
			),
	});
};
