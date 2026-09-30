import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { apiKeys, users } from "../../../db/schema/auth.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

const apiKeyWithOwner = {
	id: apiKeys.id,
	userId: apiKeys.userId,
	name: apiKeys.name,
	prefix: apiKeys.prefix,
	ownerEmail: users.email,
	lastUsedAt: apiKeys.lastUsedAt,
	revokedAt: apiKeys.revokedAt,
	createdAt: apiKeys.createdAt,
};

export const insertApiKey = async ({
	ctx,
	userId,
	name,
	prefix,
	keyHash,
}: {
	ctx: TwdContext;
	userId: string;
	name: string;
	prefix: string;
	keyHash: string;
}) => {
	const [row] = await ctx.db
		.insert(apiKeys)
		.values({ id: `key_${crypto.randomUUID()}`, userId, name, prefix, keyHash })
		.returning();
	return row;
};

export const listApiKeysWithOwner = async ({ ctx }: { ctx: TwdContext }) =>
	ctx.db
		.select(apiKeyWithOwner)
		.from(apiKeys)
		.innerJoin(users, eq(users.id, apiKeys.userId))
		.orderBy(desc(apiKeys.createdAt));

export const getApiKeyWithOwner = async ({
	ctx,
	id,
}: {
	ctx: TwdContext;
	id: string;
}) => {
	const [row] = await ctx.db
		.select(apiKeyWithOwner)
		.from(apiKeys)
		.innerJoin(users, eq(users.id, apiKeys.userId))
		.where(eq(apiKeys.id, id));
	return row;
};

/** Unrevoked key by hash, joined with its owner. */
export const findActiveApiKeyByHash = async ({
	ctx,
	keyHash,
}: {
	ctx: TwdContext;
	keyHash: string;
}) => {
	const [row] = await ctx.db
		.select(apiKeyWithOwner)
		.from(apiKeys)
		.innerJoin(users, eq(users.id, apiKeys.userId))
		.where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)));
	return row;
};

export const revokeApiKeyRow = async ({
	ctx,
	id,
}: {
	ctx: TwdContext;
	id: string;
}) => {
	await ctx.db
		.update(apiKeys)
		.set({ revokedAt: new Date() })
		.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)));
};

/** Bumps last_used_at at most once per `throttleMs`. */
export const touchApiKey = async ({
	ctx,
	id,
	throttleMs,
}: {
	ctx: TwdContext;
	id: string;
	throttleMs: number;
}) => {
	await ctx.db
		.update(apiKeys)
		.set({ lastUsedAt: new Date() })
		.where(
			and(
				eq(apiKeys.id, id),
				or(
					isNull(apiKeys.lastUsedAt),
					lt(apiKeys.lastUsedAt, new Date(Date.now() - throttleMs)),
				),
			),
		);
};
