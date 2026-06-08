import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
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
