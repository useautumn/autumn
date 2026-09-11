// A default plan used to hide billing-cycle options even alongside a non-default plan.
// Mixed plans must leave the options visible; default-only customers remain excluded.
import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { CusProductStatus, type FullCustomer } from "@autumn/shared";
import { Hono } from "hono";
import * as tinybirdUtils from "@/external/tinybird/tinybirdUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { eventActions } from "@/internal/analytics/actions/eventActions.js";
import { handleInternalAggregateEvents } from "@/internal/analytics/internalHandlers/handleInternalAggregateEvents.js";
import { CusService } from "@/internal/customers/CusService.js";

afterEach(() => mock.restore());

test.each([
	{
		name: "default then non-default",
		defaults: [true, false],
		excluded: false,
	},
	{
		name: "non-default then default",
		defaults: [false, true],
		excluded: false,
	},
	{ name: "default only", defaults: [true, true], excluded: true },
	{ name: "non-default only", defaults: [false], excluded: false },
	{ name: "no products", defaults: [], excluded: true },
	{
		name: "scheduled non-default alongside active default",
		defaults: [true, false],
		statuses: [CusProductStatus.Active, CusProductStatus.Scheduled],
		excluded: true,
	},
	{
		name: "past-due non-default alongside active default",
		defaults: [true, false],
		statuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		excluded: false,
	},
])("billing-cycle options: $name", async ({ defaults, statuses, excluded }) => {
	const customer = {
		id: "customer_123",
		customer_products: defaults.map((is_default, index) => ({
			status: statuses?.[index] ?? CusProductStatus.Active,
			product: { is_default },
		})),
	} as FullCustomer;
	spyOn(CusService, "getFull").mockResolvedValue(customer);
	spyOn(tinybirdUtils, "assertTinybirdAvailable").mockImplementation(() => {});
	spyOn(eventActions, "aggregate").mockResolvedValue({
		formatted: { data: [], meta: [], rows: 0 },
		truncated: false,
	});
	spyOn(eventActions, "getCountAndSum").mockResolvedValue({});
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		const ctx: Pick<AutumnContext, "features"> = { features: [] };
		c.set("ctx", ctx as AutumnContext);
		await next();
	});
	app.post("/aggregate", ...handleInternalAggregateEvents);

	const response = await app.request("/aggregate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			customer_id: customer.id,
			event_names: [],
			interval: "30d",
		}),
	});

	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ bcExclusionFlag: excluded });
});
