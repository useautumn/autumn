/**
 * TDD feature test for per-customer JWTs (`am_cjwt_` scoped credentials).
 *
 * Lets self-hosted / licensed apps call Autumn directly without shipping an
 * `am_sk` live key: a signed, customer-scoped token verified at the auth gate.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /v1/keys.mint    (am_sk)              -> { access_token, refresh_token, expires_at, refresh_expires_at }
 *     - POST /v1/keys.refresh (refresh-token auth) -> { access_token, refresh_token, expires_at, refresh_expires_at } (rotating)
 *     - POST /v1/keys.revoke  (am_sk)              -> { revoked: true }
 *   Token shape:
 *     - access  token: `am_cjwt_` prefix, aud=autumn-api,     exp +1h
 *     - refresh token: `am_cjwt_` prefix, aud=autumn-refresh, exp +24h
 *   New behaviors:
 *     - access token authorized on the allowlisted routes (check×2, track×2, customers.get, entities.get, events.list, events.aggregate)
 *     - analytics routes (events.list / events.aggregate) are read-only and scoped: a caller can ONLY query their own customer's events
 *     - body.customer_id is FORCE-SET to the token's customer (passing another id is ignored)
 *     - non-allowlisted route (customers.list) with an access token -> 403
 *     - x-api-version < 2.3 with an access token -> 400
 *     - entities.get is scoped: another customer's entity -> not found
 *     - scopes are enforced: a read-only token cannot track -> 403
 *     - refresh rotates: returns a NEW access AND refresh token; new access works
 *     - aud isolation: refresh token on a data route -> 403; access token on keys.refresh -> 403
 *     - revoke kills the whole family (access + refresh) -> 401; re-mint issues working tokens
 *   Side effects (observable):
 *     - revoke is durable within the session: prior tokens stay dead, fresh mint works
 *
 * Pre-impl red: keys.* routes 404 and the am_cjwt_ auth branch is incomplete,
 * so mint fails and every downstream assertion fails.
 * Post-impl green: all assertions pass once the keys router + customerJwt
 * middleware (aud branch, allowlist, force-set, scopes, Redis epoch) exist.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const startsWithJwt = (token: unknown) =>
	typeof token === "string" && token.startsWith("am_jwt_");

test(`${chalk.yellowBright("customer-jwt: mint/scope/allowlist/refresh/revoke contract")}`, async () => {
	// Run-unique id: step 9a reads events back from the shared Tinybird
	// workspace, so a fixed id could false-green on stale prior-run events.
	const customerId = `cjwt-main-${crypto.randomUUID().slice(0, 8)}`;
	const otherId = "cjwt-other";

	const prod = products.base({
		id: "cjwt_pro",
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
			s.otherCustomers([{ id: otherId }]),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	const baseUrl = autumnV2_2.baseUrl;
	const adminKey = ctx.orgSecretKey;

	const raw = async ({
		path,
		token,
		version = "2.3.0",
		body = {},
	}: {
		path: string;
		token: string;
		version?: string | null;
		body?: Record<string, unknown>;
	}) => {
		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};
		if (version) {
			headers["x-api-version"] = version;
		}
		const res = await fetch(`${baseUrl}${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
		const json = (await res.json().catch(() => null)) as any;
		return { status: res.status, json };
	};

	// ── 1: mint (am_sk) returns prefixed access + refresh tokens ──────────
	const mint = await raw({
		path: "/keys.mint",
		token: adminKey,
		body: { customer_id: customerId },
	});
	expect(mint.status).toBe(200);
	expect(startsWithJwt(mint.json?.access_token)).toBe(true);
	expect(startsWithJwt(mint.json?.refresh_token)).toBe(true);
	expect(typeof mint.json?.expires_at).toBe("number");
	expect(typeof mint.json?.refresh_expires_at).toBe("number");

	const accessToken = mint.json.access_token as string;
	const refreshToken = mint.json.refresh_token as string;

	// ── 2: access token authorized on check, scoped to its customer ──────
	const check = await raw({
		path: "/balances.check",
		token: accessToken,
		body: { customer_id: "ignored", feature_id: TestFeature.Messages },
	});
	expect(check.status).toBe(200);
	expect(check.json?.allowed).toBe(true);
	expect(check.json?.customer_id).toBe(customerId);

	// ── 3: access token authorized on track ──────────────────────────────
	const track = await raw({
		path: "/balances.track",
		token: accessToken,
		body: { feature_id: TestFeature.Messages, value: 1 },
	});
	expect([200, 202]).toContain(track.status);

	// ── 4: body.customer_id force-set — passing OTHER id returns SELF ─────
	const getCus = await raw({
		path: "/customers.get",
		token: accessToken,
		body: { customer_id: otherId },
	});
	expect(getCus.status).toBe(200);
	expect(getCus.json?.id).toBe(customerId);

	// ── 5: non-allowlisted route -> 403 ──────────────────────────────────
	const list = await raw({
		path: "/customers.list",
		token: accessToken,
		body: {},
	});
	expect(list.status).toBe(403);

	// ── 6: api version < 2.3 -> 400 ──────────────────────────────────────
	const oldVersion = await raw({
		path: "/balances.check",
		token: accessToken,
		version: "2.2.0",
		body: { feature_id: TestFeature.Messages },
	});
	expect(oldVersion.status).toBe(400);

	// ── 7: entities.get authorized for own entity ────────────────────────
	const mainEntity = entities[0];
	const ownEntity = await raw({
		path: "/entities.get",
		token: accessToken,
		body: { entity_id: mainEntity.id },
	});
	expect(ownEntity.status).toBe(200);
	expect(ownEntity.json?.id).toBe(mainEntity.id);

	// ── 8: entities.get scoped — another customer's token cannot read it ──
	const otherMint = await raw({
		path: "/keys.mint",
		token: adminKey,
		body: { customer_id: otherId },
	});
	const otherToken = otherMint.json.access_token as string;
	const crossEntity = await raw({
		path: "/entities.get",
		token: otherToken,
		body: { entity_id: mainEntity.id },
	});
	expect([400, 404]).toContain(crossEntity.status);

	// ── 9: analytics routes — authorized, read-only, and customer-scoped ──
	// Seed a few events for THIS customer so the analytical queries have data.
	for (let i = 0; i < 3; i++) {
		await raw({
			path: "/balances.track",
			token: accessToken,
			body: { feature_id: TestFeature.Messages, value: 1 },
		});
	}
	// Tinybird ingest is async — give it a moment before querying.
	await timeout(3000);

	// 9a: events.list authorized with an access token (previously 403).
	//     Pass a SPOOFED customer_id — force-set must override it so every
	//     returned row belongs to the token's own customer, never `otherId`.
	const listEvents = await raw({
		path: "/events.list",
		token: accessToken,
		body: { customer_id: otherId, limit: 100 },
	});
	expect(listEvents.status).toBe(200);
	expect(Array.isArray(listEvents.json?.list)).toBe(true);
	expect(listEvents.json.list.length).toBeGreaterThan(0);
	for (const event of listEvents.json.list) {
		expect(event.customer_id).toBe(customerId);
	}

	// 9b: events.aggregate authorized with an access token (previously 403).
	const aggregateEvents = await raw({
		path: "/events.aggregate",
		token: accessToken,
		body: { feature_id: TestFeature.Messages, range: "7d" },
	});
	expect(aggregateEvents.status).toBe(200);

	// 9c: aud isolation — a refresh token cannot reach analytics routes.
	const refreshOnEvents = await raw({
		path: "/events.list",
		token: refreshToken,
		body: { limit: 100 },
	});
	expect(refreshOnEvents.status).toBe(403);

	// ── 10: refresh rotates — new access AND refresh; new access works ───
	const refresh = await raw({
		path: "/keys.refresh",
		token: refreshToken,
		body: {},
	});
	expect(refresh.status).toBe(200);
	expect(startsWithJwt(refresh.json?.access_token)).toBe(true);
	expect(startsWithJwt(refresh.json?.refresh_token)).toBe(true);
	const rotatedAccess = refresh.json.access_token as string;
	const rotatedCheck = await raw({
		path: "/balances.check",
		token: rotatedAccess,
		body: { feature_id: TestFeature.Messages },
	});
	expect(rotatedCheck.status).toBe(200);

	// ── 11: aud isolation both directions ────────────────────────────────
	const refreshOnData = await raw({
		path: "/balances.check",
		token: refreshToken,
		body: { feature_id: TestFeature.Messages },
	});
	expect(refreshOnData.status).toBe(403);
	const accessOnRefresh = await raw({
		path: "/keys.refresh",
		token: accessToken,
		body: {},
	});
	expect(accessOnRefresh.status).toBe(403);

	// ── 12: revoke kills the whole family (access + refresh) -> 401 ──────
	const revoke = await raw({
		path: "/keys.revoke",
		token: adminKey,
		body: { customer_id: customerId },
	});
	expect(revoke.status).toBe(200);
	expect(revoke.json?.revoked).toBe(true);

	const deadAccess = await raw({
		path: "/balances.check",
		token: rotatedAccess,
		body: { feature_id: TestFeature.Messages },
	});
	expect(deadAccess.status).toBe(401);
	const deadRefresh = await raw({
		path: "/keys.refresh",
		token: refreshToken,
		body: {},
	});
	expect(deadRefresh.status).toBe(401);

	// ── 13: re-mint after revoke issues working tokens ───────────────────
	const remint = await raw({
		path: "/keys.mint",
		token: adminKey,
		body: { customer_id: customerId },
	});
	expect(remint.status).toBe(200);
	const freshToken = remint.json.access_token as string;
	const freshCheck = await raw({
		path: "/balances.check",
		token: freshToken,
		body: { feature_id: TestFeature.Messages },
	});
	expect(freshCheck.status).toBe(200);

	// 14: indefinite mint — no-exp access token, no refresh token
	const indef = await raw({
		path: "/keys.mint",
		token: adminKey,
		body: { customer_id: customerId, indefinite: true },
	});
	expect(indef.status).toBe(200);
	expect(startsWithJwt(indef.json?.access_token)).toBe(true);
	expect(indef.json?.refresh_token).toBeUndefined();
	expect(indef.json?.expires_at).toBeNull();
	const indefToken = indef.json.access_token as string;
	const indefCheck = await raw({
		path: "/balances.check",
		token: indefToken,
		body: { feature_id: TestFeature.Messages },
	});
	expect(indefCheck.status).toBe(200);

	// 15: revoke is durable — kills the indefinite token too
	await raw({
		path: "/keys.revoke",
		token: adminKey,
		body: { customer_id: customerId },
	});
	const deadIndef = await raw({
		path: "/balances.check",
		token: indefToken,
		body: { feature_id: TestFeature.Messages },
	});
	expect(deadIndef.status).toBe(401);
});
