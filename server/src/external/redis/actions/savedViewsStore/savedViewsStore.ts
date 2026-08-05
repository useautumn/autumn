import { getMiscRedis } from "@/external/redis/initRedis.js";
import { tryRedisOp } from "@/external/redis/utils/runRedisOp.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Pinned: Redis is the ONLY store for saved views (no TTL, no DB row), so
 *  they must live on a single instance. */
export type SavedView = {
	id: string;
	name: string;
	filters: unknown;
	created_at: string;
	org_id: string;
};

export const buildSavedViewKey = ({
	orgId,
	env,
	viewId,
}: {
	orgId: string;
	env: string;
	viewId: string;
}) => `saved_views:${orgId}:${env}:${viewId}`;

export const buildSavedViewIdListKey = ({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}) => `saved_views_list:${orgId}:${env}`;

export const getSavedView = async ({
	ctx,
	viewId,
}: {
	ctx: AutumnContext;
	viewId: string;
}): Promise<SavedView | null> => {
	const miscRedis = getMiscRedis();
	const viewKey = buildSavedViewKey({ orgId: ctx.org.id, env: ctx.env, viewId });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(viewKey),
		source: "saved-views:get",
		redisInstance: miscRedis,
	});
	if (!cached) return null;

	return JSON.parse(cached) as SavedView;
};

export const setSavedView = async ({
	ctx,
	view,
}: {
	ctx: AutumnContext;
	view: SavedView;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const viewKey = buildSavedViewKey({
		orgId: ctx.org.id,
		env: ctx.env,
		viewId: view.id,
	});

	await tryRedisOp({
		operation: () => miscRedis.set(viewKey, JSON.stringify(view)),
		source: "saved-views:set",
		redisInstance: miscRedis,
		onError: (error) =>
			ctx.logger.warn("[savedViews] set failed", {
				data: { viewId: view.id },
				error,
			}),
	});
};

export const deleteSavedView = async ({
	ctx,
	viewId,
}: {
	ctx: AutumnContext;
	viewId: string;
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const viewKey = buildSavedViewKey({ orgId: ctx.org.id, env: ctx.env, viewId });

	await tryRedisOp({
		operation: () => miscRedis.del(viewKey),
		source: "saved-views:delete",
		redisInstance: miscRedis,
		onError: (error) =>
			ctx.logger.warn("[savedViews] delete failed", {
				data: { viewId },
				error,
			}),
	});
};

export const getSavedViewIdList = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<string[]> => {
	const miscRedis = getMiscRedis();
	const listKey = buildSavedViewIdListKey({ orgId: ctx.org.id, env: ctx.env });

	const cached = await tryRedisOp({
		operation: () => miscRedis.get(listKey),
		source: "saved-views:get-list",
		redisInstance: miscRedis,
	});
	if (!cached) return [];

	return JSON.parse(cached) as string[];
};

export const setSavedViewIdList = async ({
	ctx,
	viewIds,
}: {
	ctx: AutumnContext;
	viewIds: string[];
}): Promise<void> => {
	const miscRedis = getMiscRedis();
	const listKey = buildSavedViewIdListKey({ orgId: ctx.org.id, env: ctx.env });

	await tryRedisOp({
		operation: () => miscRedis.set(listKey, JSON.stringify(viewIds)),
		source: "saved-views:set-list",
		redisInstance: miscRedis,
		onError: (error) =>
			ctx.logger.warn("[savedViews] set-list failed", { error }),
	});
};
