/**
 * Contract under test — org-configurable idempotency TTLs:
 *   - resolveIdempotencyTtlMs reads ctx.org.idempotency_config: a matching
 *     routeGroup entry → hours converted to ms; no entry, no config, or a
 *     null routeGroup → the 24h default.
 *   - RouteGroups are declared per route via createRoute and resolved from
 *     middleware (before the handler runs) via getRouteGroup(c).
 */

import { describe, expect, test } from "bun:test";
import {
	DEFAULT_IDEMPOTENCY_TTL_HOURS,
	IdempotencyConfigEntrySchema,
	ms,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { Hono } from "hono";
import { getRouteGroup } from "@/honoMiddlewares/routeGroupRegistry.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { resolveIdempotencyTtlMs } from "@/internal/misc/idempotency/resolveIdempotencyTtl.js";

const ctxWithConfig = (
	idempotencyConfig: AutumnContext["org"]["idempotency_config"],
) =>
	({
		org: { id: "org_123", idempotency_config: idempotencyConfig },
		env: "sandbox",
	}) as unknown as AutumnContext;

describe("resolveIdempotencyTtlMs", () => {
	test.concurrent("uses the configured TTL for a matching route group", () => {
		const ctx = ctxWithConfig([
			{ routeGroup: RouteGroup.Balances, idempotencyTtl: 72 },
		]);

		expect(
			resolveIdempotencyTtlMs({ ctx, routeGroup: RouteGroup.Balances }),
		).toBe(ms.hours(72));
	});

	test.concurrent("defaults to 24h when the org has no config", () => {
		expect(
			resolveIdempotencyTtlMs({
				ctx: ctxWithConfig(null),
				routeGroup: RouteGroup.Balances,
			}),
		).toBe(ms.hours(DEFAULT_IDEMPOTENCY_TTL_HOURS));
	});

	test.concurrent(
		"defaults to 24h when no entry matches the route group",
		() => {
			expect(
				resolveIdempotencyTtlMs({
					ctx: ctxWithConfig([]),
					routeGroup: RouteGroup.Balances,
				}),
			).toBe(ms.hours(DEFAULT_IDEMPOTENCY_TTL_HOURS));
		},
	);

	test.concurrent("defaults to 24h when the route has no group", () => {
		const ctx = ctxWithConfig([
			{ routeGroup: RouteGroup.Balances, idempotencyTtl: 72 },
		]);

		expect(resolveIdempotencyTtlMs({ ctx, routeGroup: null })).toBe(
			ms.hours(DEFAULT_IDEMPOTENCY_TTL_HOURS),
		);
	});
});

describe("IdempotencyConfigEntrySchema bounds", () => {
	test.concurrent("rejects a TTL over 30 days", () => {
		expect(
			IdempotencyConfigEntrySchema.safeParse({
				routeGroup: RouteGroup.Balances,
				idempotencyTtl: 24 * 30 + 1,
			}).success,
		).toBe(false);
	});

	test.concurrent("rejects a TTL under 1 hour", () => {
		expect(
			IdempotencyConfigEntrySchema.safeParse({
				routeGroup: RouteGroup.Balances,
				idempotencyTtl: 0,
			}).success,
		).toBe(false);
	});

	test.concurrent("accepts exactly 30 days", () => {
		expect(
			IdempotencyConfigEntrySchema.safeParse({
				routeGroup: RouteGroup.Balances,
				idempotencyTtl: 24 * 30,
			}).success,
		).toBe(true);
	});
});

describe("routeGroup registry", () => {
	const buildApp = () => {
		const app = new Hono<HonoEnv>();
		const seen: Record<string, RouteGroup | null> = {};

		// Middleware runs BEFORE the handler — mirrors idempotencyMiddleware.
		app.use("*", async (c, next) => {
			seen[c.req.path] = getRouteGroup(c);
			await next();
		});

		app.post(
			"/webhooks/grouped",
			...createRoute({
				scopes: [Scopes.Public],
				routeGroup: RouteGroup.Balances,
				handler: async (c) => c.json({ ok: true }),
			}),
		);
		app.post(
			"/webhooks/ungrouped",
			...createRoute({
				scopes: [Scopes.Public],
				handler: async (c) => c.json({ ok: true }),
			}),
		);

		return { app, seen };
	};

	test.concurrent(
		"middleware resolves the group declared on createRoute",
		async () => {
			const { app, seen } = buildApp();

			await app.request("http://localhost/webhooks/grouped", {
				method: "POST",
			});

			expect(seen["/webhooks/grouped"]).toBe(RouteGroup.Balances);
		},
	);

	test.concurrent("routes without a declared group resolve null", async () => {
		const { app, seen } = buildApp();

		await app.request("http://localhost/webhooks/ungrouped", {
			method: "POST",
		});

		expect(seen["/webhooks/ungrouped"]).toBeNull();
	});
});
