import {
	AppEnv,
	customers,
	ErrCode,
	member,
	type Organization,
	organizations,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	deleteOrg,
	listOrgSandboxes,
} from "@/internal/orgs/deleteOrg/deleteOrg.js";
import { auth } from "@/utils/auth.js";

const isOwnerRole = (role: string) => role.split(",").includes("owner");

/**
 * Works out which orgs go away with the user. Orgs where the user is the only
 * member are deleted (deleteOrg also removes their sandboxes). Orgs with other members are left
 * alone, but the user can't be their last owner.
 */
const getOrgsToDelete = async ({
	db,
	userId,
}: {
	db: DrizzleCli;
	userId: string;
}): Promise<Organization[]> => {
	const userMemberships = await db.query.member.findMany({
		where: eq(member.userId, userId),
	});
	if (userMemberships.length === 0) return [];

	const orgIds = userMemberships.map((membership) => membership.organizationId);
	const orgMembers = await db.query.member.findMany({
		where: inArray(member.organizationId, orgIds),
	});
	const orgs = await db.query.organizations.findMany({
		where: inArray(organizations.id, orgIds),
	});

	const orgsToDelete: Organization[] = [];
	for (const org of orgs) {
		const otherMembers = orgMembers.filter(
			(orgMember) =>
				orgMember.organizationId === org.id && orgMember.userId !== userId,
		);

		if (otherMembers.length === 0) {
			orgsToDelete.push(org as Organization);
			continue;
		}

		const userMembership = userMemberships.find(
			(membership) => membership.organizationId === org.id,
		);
		const userIsOwner = userMembership && isOwnerRole(userMembership.role);
		const hasOtherOwner = otherMembers.some((orgMember) =>
			isOwnerRole(orgMember.role),
		);

		if (userIsOwner && !hasOtherOwner) {
			throw new RecaseError({
				message: `You're the only owner of ${org.name}. Make another member an owner, or remove them, before deleting your account.`,
				code: "LAST_OWNER",
				statusCode: 400,
			});
		}
	}

	return orgsToDelete;
};

/**
 * Permanently deletes a user, every org they solely belong to (plus sandboxes),
 * and their marketing contacts (via the better-auth user.delete hook).
 */
export const deleteAccount = async ({
	db,
	userId,
	logger,
}: {
	db: DrizzleCli;
	userId: string;
	logger: Logger;
}) => {
	const orgsToDelete = await getOrgsToDelete({ db, userId });

	// Check every org (and sandbox) up front so we never leave the account
	// half-deleted.
	if (orgsToDelete.length > 0) {
		const sandboxes = await listOrgSandboxes({
			db,
			orgIds: orgsToDelete.map((org) => org.id),
		});
		const orgsToCheck = [...orgsToDelete, ...sandboxes];
		const liveCustomer = await db.query.customers.findFirst({
			where: and(
				inArray(
					customers.org_id,
					orgsToCheck.map((org) => org.id),
				),
				eq(customers.env, AppEnv.Live),
			),
		});

		if (liveCustomer) {
			const org = orgsToCheck.find((o) => o.id === liveCustomer.org_id);
			throw new RecaseError({
				message: `${org?.name ?? "One of your organizations"} has production mode customers. Contact support to delete your account.`,
				code: ErrCode.OrgHasCustomers,
				statusCode: 400,
			});
		}
	}

	for (const org of orgsToDelete) {
		logger.info(`Deleting org ${org.id} (${org.slug}) for account deletion`);
		await deleteOrg({ db, org, logger, deleteOrgFromDb: true });
	}

	// Goes through better-auth so sessions/accounts are cleared and the
	// user.delete hooks (Loops/Resend cleanup) run.
	const authContext = await auth.$context;
	await authContext.internalAdapter.deleteUser(userId);
};
