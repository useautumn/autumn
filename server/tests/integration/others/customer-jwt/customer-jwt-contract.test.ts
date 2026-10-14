import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { pollUntil } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const startsWithJwt = (token: unknown) =>
	typeof token === "string" && token.startsWith("am_jwt_");

test(`${chalk.yellowBright("customer-jwt: mint/scope/allowlist/refresh/revoke contract")}`, async () => {
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

	const check = await raw({
		path: "/balances.check",
		token: accessToken,
		body: { customer_id: "ignored", feature_id: TestFeature.Messages },
	});
	expect(check.status).toBe(200);
	expect(check.json?.allowed).toBe(true);
	expect(check.json?.customer_id).toBe(customerId);

	const track = await raw({
		path: "/balances.track",
		token: accessToken,
		body: { feature_id: TestFeature.Messages, value: 1 },
	});
	expect([200, 202]).toContain(track.status);

	const getCus = await raw({
		path: "/customers.get",
		token: accessToken,
		body: { customer_id: otherId },
	});
	expect(getCus.status).toBe(200);
	expect(getCus.json?.id).toBe(customerId);

	const list = await raw({
		path: "/customers.list",
		token: accessToken,
		body: {},
	});
	expect(list.status).toBe(403);

	const oldVersion = await raw({
		path: "/balances.check",
		token: accessToken,
		version: "2.2.0",
		body: { feature_id: TestFeature.Messages },
	});
	expect(oldVersion.status).toBe(400);

	const mainEntity = entities[0];
	const ownEntity = await raw({
		path: "/entities.get",
		token: accessToken,
		body: { entity_id: mainEntity.id },
	});
	expect(ownEntity.status).toBe(200);
	expect(ownEntity.json?.id).toBe(mainEntity.id);

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

	for (let i = 0; i < 3; i++) {
		await raw({
			path: "/balances.track",
			token: accessToken,
			body: { feature_id: TestFeature.Messages, value: 1 },
		});
	}

	const listEvents = await pollUntil({
		fetch: () =>
			raw({
				path: "/events.list",
				token: accessToken,
				body: { customer_id: otherId, limit: 100 },
			}),
		until: (res) => res.status !== 200 || res.json?.list?.length >= 3,
		intervalMs: 1000,
	});
	expect(listEvents.status).toBe(200);
	expect(Array.isArray(listEvents.json?.list)).toBe(true);
	expect(listEvents.json.list.length).toBeGreaterThan(0);
	for (const event of listEvents.json.list) {
		expect(event.customer_id).toBe(customerId);
	}

	const aggregateEvents = await raw({
		path: "/events.aggregate",
		token: accessToken,
		body: { feature_id: TestFeature.Messages, range: "7d" },
	});
	expect(aggregateEvents.status).toBe(200);

	const refreshOnEvents = await raw({
		path: "/events.list",
		token: refreshToken,
		body: { limit: 100 },
	});
	expect(refreshOnEvents.status).toBe(403);

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
