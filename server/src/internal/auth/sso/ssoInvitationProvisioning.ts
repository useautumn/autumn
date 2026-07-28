import {
	account,
	invitation,
	member,
	organizations,
	ssoConnection,
	ssoProvider,
	user,
} from "@autumn/shared";
import { and, eq, gt, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getSsoProviderIdFromCallbackPath = (
	path: string | null | undefined,
	params?: Record<string, unknown>,
) => {
	if (typeof params?.providerId === "string" && params.providerId) {
		return decodeURIComponent(params.providerId);
	}
	const match = path?.match(/\/sso\/callback\/([^/?#]+)$/);
	return match?.[1] && !match[1].startsWith(":")
		? decodeURIComponent(match[1])
		: null;
};

export const ensureInvitedSsoMembership = async ({
	db,
	userId,
	providerId,
}: {
	db: DrizzleCli;
	userId: string;
	providerId: string;
}) => {
	const provider = await db.query.ssoProvider.findFirst({
		where: eq(ssoProvider.providerId, providerId),
	});
	if (!provider?.organizationId || !provider.domainVerified) return null;

	const organizationId = provider.organizationId;
	const membershipWhere = and(
		eq(member.organizationId, organizationId),
		eq(member.userId, userId),
	);

	// `member` has no uniqueness on (organization_id, user_id), so eligibility and
	// the write share a transaction guarded by an advisory lock on that pair.
	// Racing callbacks queue instead of each inserting their own membership.
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sso-membership:${organizationId}:${userId}`}, 0))`,
		);

		const existing = await tx.query.member.findFirst({
			where: membershipWhere,
		});
		if (existing) {
			return { organizationId, role: existing.role };
		}

		const authUser = await tx.query.user.findFirst({
			where: eq(user.id, userId),
		});
		if (!authUser) return null;

		const pendingInvite = await tx.query.invitation.findFirst({
			where: and(
				eq(invitation.organizationId, organizationId),
				eq(invitation.email, authUser.email),
				eq(invitation.status, "pending"),
				gt(invitation.expiresAt, new Date()),
			),
		});
		if (!pendingInvite) return null;

		const role = pendingInvite.role ?? "member";
		await tx.insert(member).values({
			id: `mem_${crypto.randomUUID()}`,
			organizationId,
			userId,
			role,
			createdAt: new Date(),
		});

		await tx
			.update(invitation)
			.set({ status: "accepted" })
			.where(
				and(
					eq(invitation.id, pendingInvite.id),
					eq(invitation.status, "pending"),
				),
			);

		return { organizationId, role };
	});
};

export const getSsoProviderOrganizationName = async ({
	db,
	providerId,
}: {
	db: DrizzleCli;
	providerId: string;
}) => {
	const [record] = await db
		.select({ name: organizations.name })
		.from(ssoProvider)
		.innerJoin(organizations, eq(ssoProvider.organizationId, organizations.id))
		.where(eq(ssoProvider.providerId, providerId))
		.limit(1);
	return record?.name ?? null;
};

export const userRequiresSso = async ({
	db,
	userId,
}: {
	db: DrizzleCli;
	userId: string;
}) => {
	const authUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
	});
	const domain = authUser?.email.toLowerCase().split("@")[1];
	if (!domain) return false;

	const [active] = await db
		.select({ providerId: ssoConnection.providerId })
		.from(ssoConnection)
		.innerJoin(
			ssoProvider,
			eq(ssoConnection.providerId, ssoProvider.providerId),
		)
		.where(
			and(
				eq(ssoConnection.status, "active"),
				eq(ssoProvider.domainVerified, true),
				eq(ssoProvider.domain, domain),
			),
		)
		.limit(1);
	return Boolean(active);
};

export const removeRejectedSsoAccount = async ({
	db,
	userId,
	providerId,
}: {
	db: DrizzleCli;
	userId: string;
	providerId: string;
}) => {
	await db
		.delete(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, providerId)));

	const remainingAccount = await db.query.account.findFirst({
		where: eq(account.userId, userId),
	});
	const membership = await db.query.member.findFirst({
		where: eq(member.userId, userId),
	});
	if (!remainingAccount && !membership) {
		await db.delete(user).where(eq(user.id, userId));
	}
};
