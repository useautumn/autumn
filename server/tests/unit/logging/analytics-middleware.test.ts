import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { EventEmitter } from "node:events";
import { AppEnv, AuthType } from "@autumn/shared";
import { Hono } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { analyticsMiddleware } from "@/honoMiddlewares/analyticsMiddleware.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

const createCapturingLogger = ({ logged }: { logged: unknown[][] }): Logger => {
	const logger: Logger = {
		debug: () => {},
		info: (...args) => logged.push(args),
		warn: (...args) => logged.push(args),
		error: (...args) => logged.push(args),
		child: () => logger,
	};
	return logger;
};

afterEach(() => {
	mock.restore();
});

test("terminal logging waits for the Node response to finish", async () => {
	spyOn(Math, "random").mockReturnValue(0.5);
	const logged: unknown[][] = [];
	const outgoing = Object.assign(new EventEmitter(), {
		writableFinished: false,
		destroyed: false,
	});
	const ctx = {
		timestamp: Date.now(),
		logger: createCapturingLogger({ logged }),
		extraLogs: {},
		org: { id: "org_123", slug: "test-org" },
		env: AppEnv.Live,
		authType: AuthType.SecretKey,
		apiVersion: { semver: "1.2.0" },
		scopes: [],
		id: "req_123",
	} as unknown as AutumnContext;
	const app = new Hono<HonoEnv>();

	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.use("*", analyticsMiddleware);
	app.get("/v1/balances.check", (c) => c.json({ allowed: true }));

	await app.request("/v1/balances.check", undefined, { outgoing });
	await Promise.resolve();

	expect(logged).toHaveLength(0);

	outgoing.writableFinished = true;
	outgoing.emit("finish");
	await Promise.resolve();

	expect(logged).toHaveLength(1);
});
