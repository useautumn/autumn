import { eq } from "drizzle-orm";
import { users } from "../../../db/schema/auth.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";

export type UserRow = typeof users.$inferSelect;

/** Insert or refresh a user by email; profile fields only overwrite when provided. */
export const upsertUser = async ({
	ctx,
	email,
	name,
	avatarUrl,
}: {
	ctx: TwdContext;
	email: string;
	name?: string | null;
	avatarUrl?: string | null;
}): Promise<UserRow> => {
	const [row] = await ctx.db
		.insert(users)
		.values({
			id: `usr_${crypto.randomUUID()}`,
			email,
			name: name ?? null,
			avatarUrl: avatarUrl ?? null,
		})
		.onConflictDoUpdate({
			target: users.email,
			set: {
				...(name !== undefined && { name }),
				...(avatarUrl !== undefined && { avatarUrl }),
				email,
			},
		})
		.returning();
	return row;
};

export const getUserById = async ({
	ctx,
	userId,
}: {
	ctx: TwdContext;
	userId: string;
}): Promise<UserRow | undefined> => {
	const [row] = await ctx.db.select().from(users).where(eq(users.id, userId));
	return row;
};
