import { and, eq, gt } from "drizzle-orm";
import { sessions, users } from "../../../db/schema/auth.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const createSession = async ({
	ctx,
	userId,
}: {
	ctx: TwdContext;
	userId: string;
}) => {
	const [row] = await ctx.db
		.insert(sessions)
		.values({
			id: `ses_${crypto.randomUUID()}`,
			userId,
			expiresAt: new Date(Date.now() + SESSION_TTL_MS),
		})
		.returning();
	return row;
};

/** Live (unexpired) session joined with its user. */
export const findLiveSession = async ({
	ctx,
	sessionId,
}: {
	ctx: TwdContext;
	sessionId: string;
}) => {
	const [row] = await ctx.db
		.select({ sessionId: sessions.id, userId: users.id, email: users.email })
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
	return row;
};

export const deleteSession = async ({
	ctx,
	sessionId,
}: {
	ctx: TwdContext;
	sessionId: string;
}) => {
	await ctx.db.delete(sessions).where(eq(sessions.id, sessionId));
};
