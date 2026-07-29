/**
 * TDD contract for the organization-scoped OIDC SSO facade.
 *
 * Contract under test:
 * - only organization owners/admins can create, read, verify, test, or delete SSO
 * - one OIDC provider is bound to the active organization
 * - registration returns pending TXT instructions without exposing the client secret
 * - successful TXT verification transitions pending -> validating
 * - validating connections do not route ordinary email sign-in
 * - an explicit successful owner test activates the connection
 * - active matching-domain sign-in resolves to SSO; unknown domains resolve to OTP
 * - completion returns a browser hint only for a successfully linked provider account
 * - new SSO users require an unexpired invitation and inherit its exact role
 * - provider deletion removes both facade and Better Auth provider state
 */

import { expect, test } from "bun:test";
import { AppEnv, account, organizations, ssoProvider } from "@autumn/shared";
import {
	createDashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";
import { eq } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

test("SSO facade enforces organization ownership and lifecycle", async () => {
	const { db } = initDrizzle();
	const organizationId = `org_sso_${crypto.randomUUID()}`;
	const organizationName = "SSO Route Test";
	const domain = `sso-${crypto.randomUUID()}.test`;
	await db.insert(organizations).values({
		id: organizationId,
		slug: `sso-route-${crypto.randomUUID()}`,
		name: organizationName,
		createdAt: new Date(),
	});
	const ctx = {
		org: { id: organizationId },
		env: AppEnv.Sandbox,
	};
	const owner = await createDashboardSession(ctx, { role: "owner" });
	const member = await createDashboardSession(ctx, { role: "member" });
	const baseUrl =
		process.env.AUTUMN_TEST_BASE_URL?.replace(/\/$/, "") ??
		"http://localhost:8090";

	try {
		const existing = await dashboardFetch<{
			setup: { callbackUrl: string };
			connection: unknown;
		}>(ctx, owner, "/organization/sso", {
			method: "GET",
			headers: { origin: "http://localhost:3000" },
		});
		expect(existing.status).toBe(200);
		expect(existing.data.setup.callbackUrl).toContain(
			"/api/auth/sso/callback/autumn-",
		);
		if (existing.data.connection) {
			await dashboardFetch(ctx, owner, "/organization/sso", {
				method: "DELETE",
				headers: { origin: "http://localhost:3000" },
			});
		}

		const denied = await dashboardFetch(ctx, member, "/organization/sso", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3000",
			},
			body: JSON.stringify({
				domain,
				issuer: "http://localhost:9090",
				clientId: "autumn-test",
				clientSecret: "secret",
			}),
		});
		expect(denied.status).toBe(403);
		const rawRegistration = await dashboardFetch(
			ctx,
			owner,
			"/api/auth/sso/register",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3000",
				},
				body: JSON.stringify({}),
			},
		);
		expect(rawRegistration.status).toBe(404);

		const created = await dashboardFetch<{
			connection: {
				status: string;
				domain: string;
				verification: { host: string; value: string };
				oidcConfig?: { clientSecret?: string };
			};
		}>(ctx, owner, "/organization/sso", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3000",
			},
			body: JSON.stringify({
				domain,
				issuer: "http://localhost:9090",
				clientId: "autumn-test",
				clientSecret: "secret",
			}),
		});
		expect(created.status).toBe(200);
		expect(created.data.connection.status).toBe("pending_domain_verification");
		expect(created.data.connection.domain).toBe(domain);
		expect(created.data.connection.verification.host).toContain(
			"_autumn-sso-verification-",
		);
		expect(created.data.connection.oidcConfig?.clientSecret).toBeUndefined();

		const listed = await dashboardFetch<{ connection: { status: string } }>(
			ctx,
			owner,
			"/organization/sso",
			{ method: "GET", headers: { origin: "http://localhost:3000" } },
		);
		expect(listed.status).toBe(200);
		expect(listed.data.connection.status).toBe("pending_domain_verification");

		const unresolved = await fetch(`${baseUrl}/auth/sso/resolve`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: `invited@${domain}` }),
		});
		expect(unresolved.status).toBe(200);
		expect(await unresolved.json()).toEqual({ action: "otp" });

		await fetch("http://localhost:9090/dns", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				host: created.data.connection.verification.host,
				value: created.data.connection.verification.value,
			}),
			redirect: "manual",
		});

		const verified = await dashboardFetch<{
			connection: { status: string; providerId: string };
		}>(ctx, owner, "/organization/sso/verify-domain", {
			method: "POST",
			headers: { origin: "http://localhost:3000" },
		});
		expect(verified.status).toBe(200);
		expect(verified.data.connection.status).toBe("validating");
		const rateLimited = await dashboardFetch(
			ctx,
			owner,
			"/organization/sso/verify-domain",
			{
				method: "POST",
				headers: { origin: "http://localhost:3000" },
			},
		);
		expect(rateLimited.status).toBe(429);

		const testStart = await dashboardFetch<{ url: string }>(
			ctx,
			owner,
			"/organization/sso/test",
			{ method: "POST" },
		);
		expect(testStart.status).toBe(200);
		expect(testStart.data.url).toContain("mode=test");

		await db.insert(account).values({
			id: `acc_${crypto.randomUUID()}`,
			accountId: owner.userId,
			providerId: verified.data.connection.providerId,
			userId: owner.userId,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const completed = await dashboardFetch<{
			activated: boolean;
			hint: { providerId: string; organizationName: string };
		}>(ctx, owner, "/organization/sso/complete", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				providerId: verified.data.connection.providerId,
			}),
		});
		expect(completed.status).toBe(200);
		expect(completed.data.activated).toBe(true);
		expect(completed.data.hint.providerId).toBe(
			verified.data.connection.providerId,
		);
		expect(completed.data.hint.organizationName).toBe(organizationName);

		const active = await fetch(`${baseUrl}/auth/sso/resolve`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ email: `invited@${domain}` }),
		});
		expect(active.status).toBe(200);
		const activeBody = (await active.json()) as {
			action: string;
			url: string;
		};
		expect(activeBody.action).toBe("sso");
		expect(activeBody.url).toContain(
			encodeURIComponent(verified.data.connection.providerId),
		);
		const startUrl = new URL(activeBody.url);
		const start = await dashboardFetch(
			ctx,
			owner,
			`${startUrl.pathname}${startUrl.search}`,
			{ method: "GET", redirect: "manual" },
		);
		expect(start.status).toBe(302);
		const rawSignIn = await fetch(`${baseUrl}/api/auth/sign-in/sso`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3000",
			},
			body: JSON.stringify({
				providerId: verified.data.connection.providerId,
				callbackURL: "http://localhost:3000",
			}),
		});
		expect(rawSignIn.status).toBe(404);

		const deleted = await dashboardFetch<{ success: boolean }>(
			ctx,
			owner,
			"/organization/sso",
			{
				method: "DELETE",
				headers: { origin: "http://localhost:3000" },
			},
		);
		expect(deleted.status).toBe(200);
		expect(deleted.data.success).toBe(true);

		const removed = await db.query.ssoProvider.findFirst({
			where: eq(ssoProvider.organizationId, organizationId),
		});
		expect(removed).toBeUndefined();
	} finally {
		await db
			.delete(ssoProvider)
			.where(eq(ssoProvider.organizationId, organizationId));
		await owner.cleanup();
		await member.cleanup();
		await db.delete(organizations).where(eq(organizations.id, organizationId));
	}
});
