import { member, user } from "@autumn/shared";
import type { TestHelpers } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { db } from "@/db/initDrizzle.js";
import { auth, isCapyDev } from "@/utils/auth.js";
import { generateId } from "@/utils/genUtils.js";

const CAPY_USER_EMAIL = "capy@autumn.test";

const safeRedirectPath = (path?: string) =>
	path?.startsWith("/") && !path.startsWith("//") && path[1] !== "\\"
		? path
		: "/";

export const handleCapyLogin = async (c: Context) => {
	if (!isCapyDev) return c.notFound();

	const orgId = process.env.TESTS_ORG_ID;
	if (!orgId) throw new Error("TESTS_ORG_ID is required for Capy login");

	const authContext = await auth.$context;
	const test = (authContext as { test?: TestHelpers }).test;
	if (!test?.addMember) {
		throw new Error("Better Auth test utilities are required for Capy login");
	}

	const capyUser = await db.query.user.findFirst({
		where: eq(user.email, CAPY_USER_EMAIL),
	});
	let userId: string;
	if (!capyUser) {
		const createdUser = await test.saveUser(
			test.createUser({
				id: generateId("user"),
				email: CAPY_USER_EMAIL,
				name: "Capy Admin",
				emailVerified: true,
				role: "admin",
			}),
		);
		userId = createdUser.id;
	} else if (capyUser.role !== "admin") {
		await db
			.update(user)
			.set({ role: "admin" })
			.where(eq(user.id, capyUser.id));
		userId = capyUser.id;
	} else {
		userId = capyUser.id;
	}

	const membership = await db.query.member.findFirst({
		where: and(eq(member.userId, userId), eq(member.organizationId, orgId)),
	});
	if (!membership) {
		await test.addMember({
			userId,
			organizationId: orgId,
			role: "owner",
		});
	} else if (membership.role !== "owner") {
		await db
			.update(member)
			.set({ role: "owner" })
			.where(eq(member.id, membership.id));
	}

	const { cookies, headers } = await test.login({ userId });
	await auth.api.setActiveOrganization({
		headers,
		body: { organizationId: orgId },
	});

	const secure =
		c.req.header("x-forwarded-proto") === "https" ||
		new URL(c.req.url).protocol === "https:";
	for (const cookie of cookies) {
		setCookie(c, cookie.name, cookie.value, {
			path: cookie.path,
			httpOnly: cookie.httpOnly,
			secure,
			sameSite: secure ? "None" : cookie.sameSite,
			partitioned: secure,
			expires: cookie.expires ? new Date(cookie.expires * 1000) : undefined,
		});
	}

	return c.redirect(safeRedirectPath(c.req.query("next")));
};
