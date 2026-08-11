import { afterAll, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

const orgLookupError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const realOrgUtils = {
	...(await import("@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js")),
};

afterAll(() => {
	mock.module(
		"@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js",
		() => realOrgUtils,
	);
});

mock.module("@/internal/orgs/orgUtils/getOrgWithFeaturesCached.js", () => ({
	...realOrgUtils,
	getOrgWithFeaturesCached: async () => {
		throw orgLookupError;
	},
}));

const { createWorkerContext } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/queue/createWorkerContext.js?transientOrgLookup"
);

test("preserves a transient org lookup error so recovery jobs remain retryable", async () => {
	await expect(
		createWorkerContext({
			db: {} as never,
			payload: { orgId: "org_123", env: AppEnv.Live },
			logger: { warn: mock(() => {}) } as never,
			throwOnTransientOrgLookupError: true,
		}),
	).rejects.toBe(orgLookupError);
});

test("keeps the existing missing-org behavior for jobs that do not opt into retries", async () => {
	await expect(
		createWorkerContext({
			db: {} as never,
			payload: { orgId: "org_123", env: AppEnv.Live },
			logger: { warn: mock(() => {}) } as never,
		}),
	).resolves.toBeUndefined();
});
