import {
	AuthType,
	ErrCode,
	member,
	type Organization,
	RecaseError,
	user as userTable,
} from "@autumn/shared";
import type { User } from "better-auth";
import { and, asc, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const OWNER_ROLE = "owner";

/** A secret key carries no session user, so sandbox work is attributed to the
 *  org's owner — provisioning a sandbox needs a real user (Stripe, key owner). */
const findOwnerUser = async ({
	db,
	orgId,
}: {
	db: DrizzleCli;
	orgId: string;
}): Promise<User | undefined> => {
	const rows = await db
		.select()
		.from(member)
		.innerJoin(userTable, eq(member.userId, userTable.id))
		.where(and(eq(member.organizationId, orgId), eq(member.role, OWNER_ROLE)))
		.orderBy(asc(member.createdAt))
		.limit(1);

	return rows[0]?.user as unknown as User | undefined;
};

export const resolveSandboxActor = async ({
	db,
	org,
	user,
	authType,
}: {
	db: DrizzleCli;
	org: Organization;
	user: User | undefined;
	authType: AuthType;
}): Promise<User> => {
	if (authType === AuthType.Dashboard && user) return user;

	if (authType === AuthType.SecretKey) {
		const owner = await findOwnerUser({ db, orgId: org.id });
		if (!owner) {
			throw new RecaseError({
				message:
					"This organization has no owner to act as. Create a sandbox from the dashboard instead.",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}
		return owner;
	}

	throw new RecaseError({
		message:
			"Sandboxes are managed with your organization's secret key or from the dashboard",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
};
