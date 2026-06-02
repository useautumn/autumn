import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, AuthType, RecaseError } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { RevenueCatWebhookHonoEnv } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext.js";

const org = { id: "org_123", slug: "acme" };
const features = [{ id: "messages" }];
const getWithFeatures = mock(async () => ({ org, features }));

mock.module("@/internal/orgs/OrgService", () => ({
	OrgService: {
		getWithFeatures,
	},
}));

const {
	revenuecatIdentifyMiddleware,
	revenuecatLogMiddleware,
	revenuecatSeederMiddleware,
} = await import("@/external/revenueCat/misc/revenueCatMiddleware.js");

const createLogger = () => {
	const logger = {
		debug: mock(() => undefined),
		info: mock(() => undefined),
		warn: mock(() => undefined),
		error: mock(() => undefined),
		child: mock(() => logger),
	};
	return logger;
};

type TestRevenueCatContext = {
	db: Record<string, never>;
	logger: ReturnType<typeof createLogger>;
	org?: typeof org;
	features?: typeof features;
	env: AppEnv;
	authType: AuthType;
	apiVersion: { semver: string };
	revenuecatEventType?: string;
	revenuecatEventId?: string;
};

const createContext = ({
	body = { event: { type: "INITIAL_PURCHASE", id: "evt_123" } },
}: {
	body?: unknown;
} = {}) => {
	const logger = createLogger();
	const ctx: TestRevenueCatContext = {
		db: {},
		logger,
		org: undefined,
		features: undefined,
		env: AppEnv.Sandbox,
		authType: AuthType.Unknown,
		apiVersion: { semver: "1.2.0" },
	};
	const c = {
		req: {
			param: (key?: string) => {
				const params = { orgId: "org_123", env: AppEnv.Sandbox };
				return key ? params[key as keyof typeof params] : params;
			},
			json: mock(async () => body),
		},
		get: (key: "ctx") => {
			if (key !== "ctx") throw new Error("unexpected key");
			return ctx;
		},
	} as unknown as Context<RevenueCatWebhookHonoEnv>;

	return { c, ctx, logger };
};

describe("RevenueCat webhook middleware observability", () => {
	beforeEach(() => {
		getWithFeatures.mockClear();
		getWithFeatures.mockResolvedValue({ org, features });
	});

	test("identifies RevenueCat webhooks by setting ctx.authType immediately", async () => {
		const { c, ctx } = createContext();
		let observedAuthType: AuthType | undefined;
		const next: Next = mock(async () => {
			observedAuthType = ctx.authType;
		});

		await revenuecatIdentifyMiddleware(c, next);

		expect(observedAuthType).toBe(AuthType.Revenuecat);
		expect(ctx.authType).toBe(AuthType.Revenuecat);
	});

	test("seeder preserves successful setup while marking RevenueCat auth", async () => {
		const { c, ctx, logger } = createContext();
		const next = mock(async () => undefined);

		await revenuecatSeederMiddleware(c, next);

		expect(getWithFeatures).toHaveBeenCalledWith({
			db: ctx.db,
			orgId: "org_123",
			env: AppEnv.Sandbox,
		});
		expect(ctx.authType).toBe(AuthType.Revenuecat);
		expect(ctx.org).toBe(org);
		expect(ctx.features).toBe(features);
		expect(next).toHaveBeenCalledTimes(1);
		expect(logger.child).toHaveBeenCalled();
	});

	test("logs structured middleware errors with safe RevenueCat diagnostics", async () => {
		const { c, ctx, logger } = createContext();
		ctx.org = org;
		ctx.revenuecatEventType = "RENEWAL";
		ctx.revenuecatEventId = "evt_renewal";
		const error = new RecaseError({
			message: "broken setup",
			code: "invalid_request",
			statusCode: 422,
		});
		logger.info.mockImplementation(() => {
			throw error;
		});
		const next = mock(async () => undefined);

		await expect(revenuecatLogMiddleware(c, next)).rejects.toThrow(
			"broken setup",
		);
		expect(next).not.toHaveBeenCalled();

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [message, fields] = logger.error.mock.calls[0] as unknown as [
			string,
			{
				revenuecat_webhook: Record<string, unknown>;
				error: Record<string, unknown>;
			},
		];
		expect(message).toBe("RevenueCat webhook middleware error");
		expect(fields.revenuecat_webhook).toMatchObject({
			stage: "log",
			orgId: "org_123",
			env: AppEnv.Sandbox,
			resolvedOrgId: "org_123",
			resolvedOrgSlug: "acme",
			eventType: "INITIAL_PURCHASE",
			eventId: "evt_123",
		});
		expect(fields.error).toMatchObject({
			name: "RecaseError",
			message: "broken setup",
			code: "invalid_request",
			statusCode: 422,
		});
		expect(JSON.stringify(fields)).not.toContain("Authorization");
		expect(JSON.stringify(fields)).not.toContain("webhookSecret");
	});
});

afterAll(() => {
	mock.restore();
});
