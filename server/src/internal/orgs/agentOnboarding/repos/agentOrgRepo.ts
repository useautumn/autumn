import {
	apiKeys,
	member,
	type Organization,
	OrgClaimState,
	organizations,
	session,
	user,
} from "@autumn/shared";
import { and, eq, gt, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { AGENT_PROVISIONING_KEY_SOURCE } from "../agentAuthScopeKeys.js";

export const createPendingAgentOrg = async ({
	db,
	org,
}: {
	db: Pick<DrizzleCli, "insert">;
	org: {
		id: string;
		name: string;
		slug: string;
		claimTokenHash: string;
		claimExpiresAt: Date;
	};
}): Promise<Organization> => {
	const [organization] = await db
		.insert(organizations)
		.values({
			id: org.id,
			name: org.name,
			slug: org.slug,
			logo: "",
			createdAt: new Date(),
			metadata: "",
			deployed: false,
			claim_state: OrgClaimState.Pending,
			claim_token_hash: org.claimTokenHash,
			claim_expires_at: org.claimExpiresAt,
		})
		.returning();

	if (!organization) {
		throw new Error("Failed to create organization");
	}

	return organization as Organization;
};

export const findPendingAgentOrg = async ({
	db,
	claimTokenHash,
	now,
}: {
	db: DrizzleCli;
	claimTokenHash: string;
	now: Date;
}) =>
	db.query.organizations.findFirst({
		where: and(
			eq(organizations.claim_token_hash, claimTokenHash),
			eq(organizations.claim_state, OrgClaimState.Pending),
			gt(organizations.claim_expires_at, now),
		),
	});

export const findPendingAgentOrgBySetupKeyHash = async ({
	db,
	hashedKey,
	now,
}: {
	db: Pick<DrizzleCli, "select">;
	hashedKey: string;
	now: Date;
}) => {
	const [row] = await db
		.select({ organization: organizations })
		.from(apiKeys)
		.innerJoin(organizations, eq(apiKeys.org_id, organizations.id))
		.where(
			and(
				eq(apiKeys.hashed_key, hashedKey),
				sql`${apiKeys.meta}->>'source' = ${AGENT_PROVISIONING_KEY_SOURCE}`,
				eq(organizations.claim_state, OrgClaimState.Pending),
				gt(organizations.claim_expires_at, now),
			),
		)
		.limit(1);

	return (row?.organization as Organization | undefined) ?? null;
};

export const claimPendingAgentOrg = async ({
	db,
	claimTokenHash,
	userId,
	now,
}: {
	db: Pick<DrizzleCli, "query" | "update" | "insert">;
	claimTokenHash: string;
	userId: string;
	now: Date;
}): Promise<Organization | null> => {
	const authUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
	});
	if (!authUser) return null;

	const [organization] = await db
		.update(organizations)
		.set({
			claim_state: OrgClaimState.Claimed,
			claim_token_hash: null,
			claim_expires_at: null,
		})
		.where(
			and(
				eq(organizations.claim_token_hash, claimTokenHash),
				eq(organizations.claim_state, OrgClaimState.Pending),
				gt(organizations.claim_expires_at, now),
			),
		)
		.returning();
	if (!organization) return null;

	await db.insert(member).values({
		id: generateId("mem"),
		organizationId: organization.id,
		userId,
		role: "owner",
		createdAt: now,
	});

	return organization as Organization;
};

export const updateAgentSessionOrg = async ({
	db,
	sessionToken,
	organizationId,
}: {
	db: Pick<DrizzleCli, "update">;
	sessionToken: string;
	organizationId: string;
}): Promise<boolean> => {
	const updated = await db
		.update(session)
		.set({ activeOrganizationId: organizationId })
		.where(eq(session.token, sessionToken))
		.returning({ id: session.id });

	return updated.length === 1;
};
