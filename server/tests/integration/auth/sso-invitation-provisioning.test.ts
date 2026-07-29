/**
 * TDD contract for invitation-only SSO membership.
 *
 * Contract under test:
 * - a verified SSO callback accepts only an unexpired invitation for the exact email
 * - the invitation's role is copied unchanged to the new membership
 * - the SSO organization becomes active before the session is created
 * - an uninvited SSO account is removed and session creation is rejected
 * - once SSO is active, non-SSO session creation for the domain is rejected
 */

import { expect, test } from "bun:test";
import {
	account,
	invitation,
	member,
	organizations,
	ssoConnection,
	ssoProvider,
	user,
	verification,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";
import {
	ensureInvitedSsoMembership,
	removeRejectedSsoAccount,
	userRequiresSso,
} from "@/internal/auth/sso/ssoInvitationProvisioning.js";

test("SSO callback consumes the exact invitation role before session creation", async () => {
	const { db } = initDrizzle();
	const orgId = `org_sso_invite_${crypto.randomUUID()}`;
	const inviterId = `user_${crypto.randomUUID()}`;
	const invitedId = `user_${crypto.randomUUID()}`;
	const domain = `sso-invite-${crypto.randomUUID()}.test`;
	const invitedEmail = `invited-${crypto.randomUUID()}@${domain}`;
	const providerId = `provider-${crypto.randomUUID()}`;

	try {
		await db.insert(organizations).values({
			id: orgId,
			slug: `sso-invite-${crypto.randomUUID()}`,
			name: "Invitation SSO",
			createdAt: new Date(),
		});
		await db.insert(user).values([
			{
				id: inviterId,
				name: "Inviter",
				email: `inviter-${crypto.randomUUID()}@${domain}`,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: invitedId,
				name: "Invited",
				email: invitedEmail,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
		await db.insert(ssoProvider).values({
			id: `sso_${crypto.randomUUID()}`,
			issuer: "https://idp.example.test",
			domain,
			userId: inviterId,
			providerId,
			organizationId: orgId,
			domainVerified: true,
			oidcConfig: "{}",
		});
		await db.insert(ssoConnection).values({
			id: `sso_conn_${crypto.randomUUID()}`,
			providerId,
			organizationId: orgId,
			status: "active",
		});
		await db.insert(account).values({
			id: `account_${crypto.randomUUID()}`,
			accountId: invitedId,
			providerId,
			userId: invitedId,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const inviteId = `invite_${crypto.randomUUID()}`;
		await db.insert(invitation).values({
			id: inviteId,
			organizationId: orgId,
			email: invitedEmail,
			role: "sales",
			status: "pending",
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
			inviterId,
		});

		const result = await ensureInvitedSsoMembership({
			db,
			userId: invitedId,
			providerId,
		});
		expect(result?.organizationId).toBe(orgId);

		const createdMember = await db.query.member.findFirst({
			where: and(
				eq(member.organizationId, orgId),
				eq(member.userId, invitedId),
			),
		});
		expect(createdMember?.role).toBe("sales");
		const acceptedInvite = await db.query.invitation.findFirst({
			where: eq(invitation.id, inviteId),
		});
		expect(acceptedInvite?.status).toBe("accepted");

		expect(await userRequiresSso({ db, userId: invitedId })).toBe(true);
		await db.insert(verification).values({
			id: `verification_${crypto.randomUUID()}`,
			identifier: `sign-in-otp-${invitedEmail}`,
			value: "123456",
			expiresAt: new Date(Date.now() + 60_000),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const otpSignIn = await fetch(
			`${process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8090"}/api/auth/sign-in/email-otp`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({ email: invitedEmail, otp: "123456" }),
			},
		);
		expect(otpSignIn.status).toBe(403);
		expect(await otpSignIn.json()).toMatchObject({
			message: "This account must sign in with SSO",
		});
	} finally {
		await db.delete(organizations).where(eq(organizations.id, orgId));
		await db.delete(user).where(eq(user.id, inviterId));
		await db.delete(user).where(eq(user.id, invitedId));
	}
});

test("uninvited SSO callback is rejected and its linked account is removed", async () => {
	const { db } = initDrizzle();
	const orgId = `org_sso_reject_${crypto.randomUUID()}`;
	const ownerId = `user_${crypto.randomUUID()}`;
	const rejectedId = `user_${crypto.randomUUID()}`;
	const providerId = `provider-${crypto.randomUUID()}`;
	const domain = `sso-reject-${crypto.randomUUID()}.test`;

	try {
		await db.insert(organizations).values({
			id: orgId,
			slug: `sso-reject-${crypto.randomUUID()}`,
			name: "Rejected SSO",
			createdAt: new Date(),
		});
		await db.insert(user).values([
			{
				id: ownerId,
				name: "Owner",
				email: `owner-${crypto.randomUUID()}@${domain}`,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			{
				id: rejectedId,
				name: "Rejected",
				email: `rejected-${crypto.randomUUID()}@${domain}`,
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);
		await db.insert(ssoProvider).values({
			id: `sso_${crypto.randomUUID()}`,
			issuer: "https://idp.example.test",
			domain,
			userId: ownerId,
			providerId,
			organizationId: orgId,
			domainVerified: true,
			oidcConfig: "{}",
		});
		await db.insert(ssoConnection).values({
			id: `sso_conn_${crypto.randomUUID()}`,
			providerId,
			organizationId: orgId,
			status: "active",
		});
		await db.insert(account).values({
			id: `account_${crypto.randomUUID()}`,
			accountId: rejectedId,
			providerId,
			userId: rejectedId,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		expect(
			await ensureInvitedSsoMembership({
				db,
				userId: rejectedId,
				providerId,
			}),
		).toBeNull();
		await removeRejectedSsoAccount({
			db,
			userId: rejectedId,
			providerId,
		});
		const rejectedAccount = await db.query.account.findFirst({
			where: and(
				eq(account.userId, rejectedId),
				eq(account.providerId, providerId),
			),
		});
		expect(rejectedAccount).toBeUndefined();
	} finally {
		await db.delete(organizations).where(eq(organizations.id, orgId));
		await db.delete(user).where(eq(user.id, ownerId));
		await db.delete(user).where(eq(user.id, rejectedId));
	}
});
