/**
 * Adversarial tests for per-customer JWTs — proving the credential is scoped
 * down and cannot be abused. Complements customer-jwt-contract.test.ts (the
 * happy path). Each block is an attack that MUST be rejected:
 *
 *   - Forged signature (signed with the wrong secret)        -> 401
 *   - alg:none token (algorithm-confusion)                   -> 401
 *   - Garbage / malformed token                              -> 401
 *   - Privilege escalation: access token -> keys.mint/revoke -> 403
 *   - Cross-customer: A's token cannot read B (force-set) or B's entity
 *   - Refresh reuse: replaying a rotated-away refresh token revokes the family
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { SignJWT } from "jose";

const b64url = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

test(`${chalk.yellowBright("customer-jwt adversarial: forgery / escalation / cross-customer / reuse")}`, async () => {
	const customerId = "cjwt-adv-a";
	const otherId = "cjwt-adv-b";
	const reuseId = "cjwt-adv-c";

	const prod = products.base({
		id: "cjwt_adv",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.freeAllocatedUsers({ includedUsage: 5 }),
		],
	});

	const { autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.otherCustomers([{ id: otherId }, { id: reuseId }]),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	const baseUrl = autumnV2_2.baseUrl;
	const adminKey = ctx.orgSecretKey;
	const orgId = ctx.org.id;
	const mainEntity = entities[0];

	const raw = async ({
		path,
		token,
		body = {},
	}: {
		path: string;
		token: string;
		body?: Record<string, unknown>;
	}) => {
		const res = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
				"x-api-version": "2.3.0",
			},
			body: JSON.stringify(body),
		});
		const json = (await res.json().catch(() => null)) as any;
		return { status: res.status, json };
	};

	const mint = async (cId: string, scopes?: string[]) => {
		const r = await raw({
			path: "/keys.mint",
			token: adminKey,
			body: { customer_id: cId, ...(scopes ? { scopes } : {}) },
		});
		return r.json as {
			access_token: string;
			refresh_token: string;
		};
	};

	const accessToken = (await mint(customerId)).access_token;

	// ── 1: forged signature (wrong secret) -> 401 ────────────────────────
	const forged = await new SignJWT({
		orgId,
		env: "sandbox",
		scopes: ["balances:read", "balances:write", "customers:read"],
		epoch: 0,
		refresh_kid: 1,
	})
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(customerId)
		.setAudience("autumn-api")
		.setExpirationTime("1h")
		.sign(new TextEncoder().encode("not-the-real-customer-jwt-secret"));
	const forgedCheck = await raw({
		path: "/balances.check",
		token: `am_jwt_${forged}`,
		body: { feature_id: TestFeature.Messages },
	});
	expect(forgedCheck.status).toBe(401);

	// ── 2: alg:none algorithm-confusion -> 401 ───────────────────────────
	const noneToken = `am_jwt_${b64url({ alg: "none", typ: "JWT" })}.${b64url({
		sub: customerId,
		orgId,
		env: "sandbox",
		aud: "autumn-api",
		epoch: 0,
		scopes: ["balances:read"],
	})}.`;
	const noneCheck = await raw({
		path: "/balances.check",
		token: noneToken,
		body: { feature_id: TestFeature.Messages },
	});
	expect(noneCheck.status).toBe(401);

	// ── 3: garbage / malformed token -> 401 ──────────────────────────────
	const garbage = await raw({
		path: "/balances.check",
		token: "am_jwt_not.a.real.jwt",
		body: { feature_id: TestFeature.Messages },
	});
	expect(garbage.status).toBe(401);

	// ── 4: privilege escalation — access token cannot mint or revoke ─────
	const escalateMint = await raw({
		path: "/keys.mint",
		token: accessToken,
		body: { customer_id: customerId },
	});
	expect(escalateMint.status).toBe(403);
	const escalateRevoke = await raw({
		path: "/keys.revoke",
		token: accessToken,
		body: { customer_id: otherId },
	});
	expect(escalateRevoke.status).toBe(403);

	// ── 5: cross-customer — A cannot read B, nor A's token read B's view ─
	const readOther = await raw({
		path: "/customers.get",
		token: accessToken,
		body: { customer_id: otherId },
	});
	expect(readOther.status).toBe(200);
	expect(readOther.json?.id).toBe(customerId); // force-set wins, never B

	const otherToken = (await mint(otherId)).access_token;
	const crossEntity = await raw({
		path: "/entities.get",
		token: otherToken,
		body: { entity_id: mainEntity.id }, // A's entity, B's token
	});
	expect([400, 404]).toContain(crossEntity.status);

	// ── 6: refresh reuse — replaying a rotated-away refresh revokes family ─
	const family = await mint(reuseId);
	const rt1 = family.refresh_token;
	const refresh1 = await raw({ path: "/keys.refresh", token: rt1 });
	const rt2 = refresh1.json.refresh_token as string;
	const refresh2 = await raw({ path: "/keys.refresh", token: rt2 });
	const rt3 = refresh2.json.refresh_token as string;
	expect(refresh2.status).toBe(200);

	// rt1 is now 2 generations stale -> reuse detected -> 401 + family killed
	const replay = await raw({ path: "/keys.refresh", token: rt1 });
	expect(replay.status).toBe(401);

	// the just-issued (valid-kid) rt3 is now dead too — whole family revoked
	const afterReuse = await raw({ path: "/keys.refresh", token: rt3 });
	expect(afterReuse.status).toBe(401);
});
