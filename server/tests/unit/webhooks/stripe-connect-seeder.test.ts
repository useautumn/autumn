import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { Hono } from "hono";
import RecaseError from "@/utils/errorUtils.js";

const mockState = {
	getByAccountId: undefined as (() => Promise<unknown>) | undefined,
};

mock.module("@/internal/orgs/OrgService.js", () => ({
	OrgService: {
		getByAccountId: async () => {
			if (!mockState.getByAccountId) throw new Error("not configured");
			return mockState.getByAccountId();
		},
	},
}));

mock.module("@/external/connect/initStripeCli.js", () => ({
	initMasterStripe: () => ({}),
	getStripeWebhookSecret: async () => "whsec_test",
}));

mock.module("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({}),
}));

const { stripeConnectSeederMiddleware } = await import(
	"@/external/stripe/webhookMiddlewares/stripeConnectSeederMiddleware.js"
);

const originalSkipVerify = process.env.STRIPE_WEBHOOK_SKIP_VERIFY;

type TestEnv = { Variables: { ctx: unknown } };

const createApp = () => {
	const app = new Hono<TestEnv>();

	app.use("*", async (c, next) => {
		c.set("ctx", {
			db: {},
			logger: { error: () => {}, warn: () => {}, info: () => {} },
		});
		await next();
	});

	let handlerRan = false;
	app.post(
		"/webhooks/connect/:env",
		stripeConnectSeederMiddleware as never,
		(c) => {
			handlerRan = true;
			return c.json({ processed: true }, 200);
		},
	);

	return { app, didHandlerRun: () => handlerRan };
};

const postEvent = (app: Hono<TestEnv>) =>
	app.request("/webhooks/connect/live", {
		method: "POST",
		body: JSON.stringify({
			id: "evt_test",
			type: "customer.subscription.deleted",
			account: "acct_test",
			data: { object: {} },
		}),
	});

describe("stripeConnectSeederMiddleware org resolution", () => {
	beforeEach(() => {
		process.env.STRIPE_WEBHOOK_SKIP_VERIFY = "true";
		mockState.getByAccountId = undefined;
	});

	afterAll(() => {
		process.env.STRIPE_WEBHOOK_SKIP_VERIFY = originalSkipVerify;
	});

	test("returns 200 and skips processing when the account is genuinely unlinked", async () => {
		mockState.getByAccountId = async () => {
			throw new RecaseError({
				message: "Organization not found",
				code: ErrCode.OrgNotFound,
				statusCode: 404,
			});
		};

		const { app, didHandlerRun } = createApp();
		const response = await postEvent(app);

		expect(response.status).toBe(200);
		expect(didHandlerRun()).toBe(false);
	});

	test("returns 500 so Stripe retries when org lookup fails for any other reason", async () => {
		mockState.getByAccountId = async () => {
			throw new Error("no more connections allowed (max_client_conn)");
		};

		const { app, didHandlerRun } = createApp();
		const response = await postEvent(app);

		expect(response.status).toBe(500);
		expect(didHandlerRun()).toBe(false);
	});

	test("runs the handler when the org resolves", async () => {
		mockState.getByAccountId = async () => ({
			org: { id: "org_test", slug: "test-org", config: {} },
			features: [],
		});

		const { app, didHandlerRun } = createApp();
		const response = await postEvent(app);

		expect(response.status).toBe(200);
		expect(didHandlerRun()).toBe(true);
	});
});
