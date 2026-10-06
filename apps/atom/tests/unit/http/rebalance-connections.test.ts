import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { rebalanceConnectionsMiddleware } from "../../../src/http/middlewares/rebalanceConnectionsMiddleware.js";

const appWith = ({ random }: { random: () => number }) => {
	const app = new Hono();
	app.use(rebalanceConnectionsMiddleware({ random }));
	app.get("/", (context) => context.text("ok"));
	return app;
};

describe("connection rebalancing", () => {
	test("a drawn response closes its connection so the caller reconnects", async () => {
		const response = await appWith({ random: () => 0 }).request("/");

		expect(response.headers.get("connection")).toBe("close");
		expect(await response.text()).toBe("ok");
	});

	test("every other response keeps its connection", async () => {
		const response = await appWith({ random: () => 0.5 }).request("/");

		expect(response.headers.get("connection")).toBeNull();
	});
});
