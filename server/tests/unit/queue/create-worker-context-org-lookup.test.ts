import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

const mockState: {
	getOrgWithFeaturesCached: () => Promise<unknown>;
} = {
	getOrgWithFeaturesCached: async () => null,
};

mock.module("@/internal/orgs/orgUtils/cacheOrgWithFeatures.js", () => ({
	getOrgWithFeaturesCached: () => mockState.getOrgWithFeaturesCached(),
}));

const { createWorkerContext } = await import("@/queue/createWorkerContext.js");

const warnings: string[] = [];
const stubLogger = {
	warn: (message: string) => warnings.push(message),
	error: () => {},
	info: () => {},
	debug: () => {},
} as unknown as Logger;

const callParams = {
	db: {} as DrizzleCli,
	payload: { orgId: "org_test", env: "sandbox" as AppEnv },
	logger: stubLogger,
};

describe("createWorkerContext org lookup", () => {
	beforeEach(() => {
		warnings.length = 0;
	});

	it("skips the job only when the org genuinely does not exist", async () => {
		mockState.getOrgWithFeaturesCached = async () => null;

		const ctx = await createWorkerContext(callParams);

		expect(ctx).toBeUndefined();
		expect(warnings.some((message) => message.includes("not found"))).toBe(
			true,
		);
	});

	it("propagates lookup failures instead of reporting the org as missing", async () => {
		mockState.getOrgWithFeaturesCached = async () => {
			throw new Error("connection timeout");
		};

		await expect(createWorkerContext(callParams)).rejects.toThrow(
			"connection timeout",
		);
		expect(warnings).toHaveLength(0);
	});
});
