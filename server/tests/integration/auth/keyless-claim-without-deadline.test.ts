/**
 * Keyless orgs have no claim deadline. One provisioned before that still stores a past
 * claim_expires_at, and must stay claimable by setup key and claim token, then by its new owner.
 */

import { afterAll, expect, test } from "bun:test";
import { member, organizations, user } from "@autumn/shared";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import { hashAgentClaimToken } from "@/internal/orgs/agentOnboarding/agentAuthUtils.js";
import { claimPendingAgentOrg } from "@/internal/orgs/agentOnboarding/repos/agentOrgRepo.js";

const { db } = initDrizzle();
const baseUrl = process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080";
const suffix = crypto.randomUUID().slice(0, 8);
const ONE_DAY_MS = 86_400_000;

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
	for (const orgId of createdOrgIds) {
		await db.delete(member).where(eq(member.organizationId, orgId));
		await db.delete(organizations).where(eq(organizations.id, orgId));
	}
	for (const userId of createdUserIds)
		await db.delete(user).where(eq(user.id, userId));
});

type Provisioned = {
	organization_id: string;
	api_key: string;
	claim_token: string;
	claim_expires_at: string | null;
};

const provisionKeylessOrg = async (): Promise<Provisioned> => {
	const res = await fetch(`${baseUrl}/agent.provision`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			name: `keyless-no-deadline-${suffix}`,
			slug: `keyless-no-deadline-${suffix}`,
		}),
	});
	expect(res.status).toBe(200);
	return res.json();
};

// Stands in for an org provisioned while claims still expired after 72 hours
const backdateClaimDeadline = async ({ orgId }: { orgId: string }) => {
	await db
		.update(organizations)
		.set({ claim_expires_at: new Date(Date.now() - ONE_DAY_MS) })
		.where(eq(organizations.id, orgId));
};

const startClaim = ({
	email,
	setupKey,
	claimToken,
}: {
	email: string;
	setupKey?: string;
	claimToken?: string;
}) =>
	fetch(`${baseUrl}/agent.start_claim`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			...(setupKey && { authorization: `Bearer ${setupKey}` }),
		},
		body: JSON.stringify({
			email,
			...(claimToken && { claim_token: claimToken }),
		}),
	});

const createUser = async () => {
	const now = new Date();
	const userId = `keyless_claimer_${suffix}`;
	await db.insert(user).values({
		id: userId,
		name: "Keyless claimer",
		email: `${userId}@example.com`,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
	});
	createdUserIds.push(userId);
	return userId;
};

test(`${chalk.yellowBright("keyless: an org past its old claim deadline can still be claimed")}`, async () => {
	const provisioned = await provisionKeylessOrg();
	const orgId = provisioned.organization_id;
	createdOrgIds.push(orgId);
	expect(provisioned.claim_expires_at).toBeNull();

	await backdateClaimDeadline({ orgId });

	const me = await fetch(`${baseUrl}/v1/organization/me`, {
		headers: { authorization: `Bearer ${provisioned.api_key}` },
	}).then((res) => res.json());
	expect(me.claim_state).toBe("pending");
	expect(me.claim_expires_at).toBeNull();

	const email = `keyless-${suffix}@example.com`;
	const bySetupKey = await startClaim({
		email,
		setupKey: provisioned.api_key,
	});
	expect(bySetupKey.status).toBe(200);
	expect((await bySetupKey.json()).claim_url).toContain("/claim?token=");

	const byClaimToken = await startClaim({
		email,
		claimToken: provisioned.claim_token,
	});
	expect(byClaimToken.status).toBe(200);

	// The browser step authenticates the user, then commits this claim
	const userId = await createUser();
	const claimed = await claimPendingAgentOrg({
		db,
		claimTokenHash: hashAgentClaimToken({
			claimToken: provisioned.claim_token,
		}),
		userId,
		now: new Date(),
	});
	expect(claimed?.claim_state).toBe("claimed");
	expect(claimed?.claim_expires_at).toBeNull();

	const [owner] = await db
		.select()
		.from(member)
		.where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
	expect(owner?.role).toBe("owner");

	const afterClaim = await startClaim({
		email,
		claimToken: provisioned.claim_token,
	});
	expect(afterClaim.status).toBe(400);
});
