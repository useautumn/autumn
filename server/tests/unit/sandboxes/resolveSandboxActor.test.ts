import { describe, expect, test } from "bun:test";
import { AuthType, type Organization } from "@autumn/shared";
import type { User } from "better-auth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { resolveSandboxActor } from "@/internal/sandboxes/resolveSandboxActor.js";

// The owner lookup is one select().from().innerJoin().where().orderBy().limit()
// chain, so a chainable stub covers every auth-type branch without a DB.
const stubDb = (rows: unknown[]): DrizzleCli => {
	const chain = {
		select: () => chain,
		from: () => chain,
		innerJoin: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: () => Promise.resolve(rows),
	};
	return chain as unknown as DrizzleCli;
};

const org = { id: "org_123" } as Organization;
const sessionUser = { id: "user_session" } as unknown as User;
const ownerUser = { id: "user_owner" } as unknown as User;

describe("resolveSandboxActor", () => {
	test("a dashboard session resolves to its own user, with no owner lookup", async () => {
		const actor = await resolveSandboxActor({
			db: stubDb([]),
			org,
			user: sessionUser,
			authType: AuthType.Dashboard,
		});
		expect(actor).toBe(sessionUser);
	});

	test("a secret key resolves to the org's owner member", async () => {
		const actor = await resolveSandboxActor({
			db: stubDb([{ member: { role: "owner" }, user: ownerUser }]),
			org,
			user: undefined,
			authType: AuthType.SecretKey,
		});
		expect(actor).toEqual(ownerUser);
	});

	test("a secret key on an org with no owner is rejected", async () => {
		await expect(
			resolveSandboxActor({
				db: stubDb([]),
				org,
				user: undefined,
				authType: AuthType.SecretKey,
			}),
		).rejects.toThrow(/no owner to act as/);
	});

	test("a dashboard auth type carrying no user is rejected", async () => {
		await expect(
			resolveSandboxActor({
				db: stubDb([]),
				org,
				user: undefined,
				authType: AuthType.Dashboard,
			}),
		).rejects.toThrow(/secret key or from the dashboard/);
	});

	test("any other auth type (publishable key, customer JWT) is rejected", async () => {
		for (const authType of [AuthType.PublicKey, AuthType.CustomerJwt]) {
			await expect(
				resolveSandboxActor({
					db: stubDb([{ member: {}, user: ownerUser }]),
					org,
					user: sessionUser,
					authType,
				}),
			).rejects.toThrow(/secret key or from the dashboard/);
		}
	});
});
