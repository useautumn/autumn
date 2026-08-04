/**
 * Request-header (`Idempotency-Key`) idempotency.
 *
 * Contract under test:
 *   - A 2xx response keeps the key → an identical retry gets 409
 *     duplicate_idempotency_key.
 *   - A 4xx/5xx response (except 409) releases the key → the retry re-runs
 *     and returns the original outcome.
 *   - Applies to every apiRouter route (asserted middleware-level and
 *     end-to-end through /track).
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Hono } from "hono";
import { errorMiddleware } from "@/honoMiddlewares/errorMiddleware.js";
import { idempotencyMiddleware } from "@/honoMiddlewares/idempotencyMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

const buildApp = () => {
	const app = new Hono<HonoEnv>();

	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.use("*", idempotencyMiddleware);

	app.post("/success", (c) => c.json({ success: true }));
	app.post("/failure", (c) => c.json({ success: false }, 500));

	app.onError(errorMiddleware);

	return app;
};

test.concurrent(
	"idempotency middleware keeps keys for 200 responses",
	async () => {
		const app = buildApp();
		const idempotencyKey = `idem-success-${Date.now().toString(36)}`;

		const first = await app.request("http://localhost/success", {
			method: "POST",
			headers: { "Idempotency-Key": idempotencyKey },
		});
		const second = await app.request("http://localhost/success", {
			method: "POST",
			headers: { "Idempotency-Key": idempotencyKey },
		});
		const secondBody = await second.json();

		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		expect(secondBody.code).toBe(ErrCode.DuplicateIdempotencyKey);
	},
);

test.concurrent(
	"idempotency middleware releases keys for 500 responses",
	async () => {
		const app = buildApp();
		const idempotencyKey = `idem-failure-${Date.now().toString(36)}`;

		const first = await app.request("http://localhost/failure", {
			method: "POST",
			headers: { "Idempotency-Key": idempotencyKey },
		});
		const second = await app.request("http://localhost/failure", {
			method: "POST",
			headers: { "Idempotency-Key": idempotencyKey },
		});

		expect(first.status).toBe(500);
		expect(second.status).toBe(500);
	},
);

// ── End-to-end through /track ────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("header idempotency e2e: successful /track keeps the key, retry gets 409")}`,
	async () => {
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 20 })],
		});

		const { autumnV2_3, customerId } = await initScenario({
			customerId: "header-idem-e2e-success",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const headerKey = `header-e2e-${Date.now().toString(36)}`;
		const track = () =>
			autumnV2_3.track(
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
				},
				{ headers: { "Idempotency-Key": headerKey } },
			);

		await track();

		await expectAutumnError({
			errCode: ErrCode.DuplicateIdempotencyKey,
			func: track,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-global-idempotency-4xx: retries return original 4xx")}`,
	async () => {
		const { autumnV2_3, customerId } = await initScenario({
			customerId: "track-global-idempotency-4xx",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const idempotencyKey = `track-global-idempotency-4xx-${Date.now().toString(36)}`;
		const trackMissingEntity = async () =>
			autumnV2_3.track(
				{
					customer_id: customerId,
					entity_id: `${customerId}-missing-entity`,
					event_name: "messages",
					value: 1,
				},
				{ headers: { "Idempotency-Key": idempotencyKey } },
			);

		const getErrorCode = async () => {
			try {
				await trackMissingEntity();
			} catch (error) {
				if (error && typeof error === "object" && "code" in error) {
					return String(error.code);
				}

				throw error;
			}

			throw new Error("Expected track to fail");
		};

		const firstCode = await getErrorCode();
		expect(firstCode).not.toBe(ErrCode.DuplicateIdempotencyKey);
		expect(await getErrorCode()).toBe(firstCode);
	},
);
