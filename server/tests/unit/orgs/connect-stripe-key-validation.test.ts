import {
	afterAll,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { Writable } from "node:stream";
import { classifyError, createErrorLogHook } from "@autumn/errors";
import { AppEnv, ErrCode, type Organization } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import { Hono } from "hono";
import pino from "pino";
import Stripe from "stripe";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import * as stripeEnsureUtils from "@/external/stripe/stripeEnsureUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

const { handleConnectStripe } = await import(
	"@/internal/orgs/handlers/stripeHandlers/handleConnectStripe.js"
);
const { errorMiddleware } = await import(
	"@/honoMiddlewares/errorMiddleware/errorMiddleware.js"
);

const org = {
	id: "org_123",
	stripe_config: { test_api_key: "encrypted_stored_key" },
	test_stripe_connect: {},
} as Organization;
const updateOrg = spyOn(OrgService, "update").mockImplementation(
	async () => org,
);
const ensureProducts = spyOn(stripeEnsureUtils, "ensureStripeProductsWithEnv");
const stripe = new Stripe("sk_test_synthetic");
const listCustomers = spyOn(Object.getPrototypeOf(stripe.customers), "list");
const retrieveAccount = spyOn(
	Object.getPrototypeOf(stripe.accounts),
	"retrieve",
);
const captureException = spyOn(Sentry, "captureException").mockReturnValue(
	"event_123",
);
const captureEvent = spyOn(Sentry, "captureEvent").mockReturnValue("event_123");
const lines: Record<string, unknown>[] = [];
const sink = new Writable({
	write(chunk, _encoding, callback) {
		lines.push(JSON.parse(chunk.toString()));
		callback();
	},
});
const pinoLogger = pino(
	{
		hooks: {
			logMethod: createErrorLogHook({
				service: "server",
				captureToSentry: true,
			}),
		},
	},
	sink,
);
const logger: Logger = {
	debug: () => {},
	info: () => {},
	warn: (message, fields) => pinoLogger.warn(fields, message),
	error: (message, fields) => pinoLogger.error(fields, message),
	child: () => logger,
};
const app = new Hono<HonoEnv>();
app.use("*", async (c, next) => {
	const ctx: Partial<AutumnContext> = {
		org,
		env: AppEnv.Sandbox,
		logger,
		scopes: [],
	};
	c.set("ctx", ctx as AutumnContext);
	await next();
});
app.onError(errorMiddleware);
app.post("/v1/organization/stripe", ...handleConnectStripe);

const connectStripe = (body: { secret_key?: string }) =>
	app.request("/v1/organization/stripe", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

beforeEach(() => {
	listCustomers.mockReset().mockResolvedValue({ data: [] });
	retrieveAccount
		.mockReset()
		.mockRejectedValue(new Error("Unexpected account lookup"));
	updateOrg.mockClear();
	ensureProducts.mockReset().mockResolvedValue(undefined);
	captureException.mockClear();
	captureEvent.mockClear();
	lines.length = 0;
});
afterAll(() => mock.restore());

describe("newly supplied Stripe key validation", () => {
	// Before: raw Stripe errors were captured as bugs. After: safe expected 400s.
	test.each([
		[
			"invalid",
			"sk_test_invalid_synthetic",
			new Stripe.errors.StripeAuthenticationError({
				type: "invalid_request_error",
				message: "Invalid API Key provided: credential_marker",
			}),
		],
		[
			"publishable",
			"pk_test_synthetic",
			new Stripe.errors.StripePermissionError({
				type: "invalid_request_error",
				message: "A secret key is required: credential_marker",
				code: "secret_key_required",
			}),
		],
	] as const)(
		"rejects a newly supplied %s key safely without capturing a bug",
		async (_kind, key, error) => {
			listCustomers.mockRejectedValue(error);
			const response = await connectStripe({ secret_key: key });
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({
				message:
					"Invalid Stripe secret key. Please provide a valid secret key.",
				code: ErrCode.StripeKeyInvalid,
				env: AppEnv.Sandbox,
			});
			expect(lines).toHaveLength(1);
			expect(lines[0]).toMatchObject({
				level: 40,
				error: { kind: "expected" },
			});
			expect(JSON.stringify(lines)).not.toContain("credential_marker");
			expect(JSON.stringify(lines)).not.toContain(key);
			expect(captureException).not.toHaveBeenCalled();
			expect(captureEvent).not.toHaveBeenCalled();
			expect(retrieveAccount).not.toHaveBeenCalled();
			expect(updateOrg).not.toHaveBeenCalled();
			expect(ensureProducts).not.toHaveBeenCalled();
		},
	);

	test.each([
		[
			new Stripe.errors.StripeAuthenticationError({
				type: "invalid_request_error",
				message: "Unrelated authentication rejection",
			}),
			"bug",
		],
		[
			new Stripe.errors.StripeConnectionError({
				type: "api_error",
				message: "Connection failed after retries",
			}),
			"infra",
		],
		[
			new Stripe.errors.StripeAuthenticationError({
				type: "invalid_request_error",
				message: "Account unavailable",
				code: "account_invalid",
			}),
			"bug",
		],
		[
			new Stripe.errors.StripePermissionError({
				type: "invalid_request_error",
				message: "Permission denied",
			}),
			"bug",
		],
		[new Error("Unexpected validation failure"), "bug"],
	] as const)(
		"keeps unrelated validation error %s reportable",
		async (error, kind) => {
			listCustomers.mockRejectedValue(error);
			const response = await connectStripe({ secret_key: "sk_test_synthetic" });
			expect(response.status).toBe(
				error instanceof Stripe.errors.StripeError ? 400 : 500,
			);
			expect(classifyError({ error }).kind).toBe(kind);
			expect(captureException).toHaveBeenCalledWith(
				error,
				expect.objectContaining({
					tags: expect.objectContaining({ error_kind: kind }),
				}),
			);
			expect(updateOrg).not.toHaveBeenCalled();
		},
	);

	test.each(["downstream", "stored"] as const)(
		"keeps %s-key authentication failures reportable",
		async (stage) => {
			const error = new Stripe.errors.StripeAuthenticationError({
				type: "invalid_request_error",
				message: "Authentication failed",
			});
			if (stage === "downstream") retrieveAccount.mockRejectedValue(error);
			else ensureProducts.mockRejectedValue(error);

			const response = await connectStripe(
				stage === "downstream" ? { secret_key: "sk_test_synthetic" } : {},
			);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				code: ErrCode.StripeError,
			});
			expect(captureException).toHaveBeenCalledWith(
				error,
				expect.objectContaining({
					tags: expect.objectContaining({ error_kind: "bug" }),
				}),
			);
			expect(listCustomers).toHaveBeenCalledTimes(
				stage === "downstream" ? 1 : 0,
			);
		},
	);

	test.each(["downstream", "stored"] as const)(
		"does not treat known key rejections from %s operations as validation errors",
		async (stage) => {
			for (const error of [
				new Stripe.errors.StripeAuthenticationError({
					type: "invalid_request_error",
					message: "Invalid API Key provided: synthetic",
				}),
				new Stripe.errors.StripePermissionError({
					type: "invalid_request_error",
					message: "A secret key is required",
					code: "secret_key_required",
				}),
			]) {
				captureException.mockClear();
				if (stage === "downstream") retrieveAccount.mockRejectedValue(error);
				else ensureProducts.mockRejectedValue(error);
				const response = await connectStripe(
					stage === "downstream" ? { secret_key: "sk_test_synthetic" } : {},
				);
				expect(response.status).toBe(400);
				expect(await response.json()).toMatchObject({
					code: ErrCode.StripeError,
				});
				expect(captureException).toHaveBeenCalledWith(
					error,
					expect.objectContaining({
						tags: expect.objectContaining({ error_kind: "bug" }),
					}),
				);
			}
		},
	);
});
