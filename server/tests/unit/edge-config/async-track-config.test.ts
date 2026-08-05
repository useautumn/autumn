import { afterEach, describe, expect, test } from "bun:test";
import { AsyncTrackConfigSchema } from "@/internal/misc/edgeConfigs/asyncTrack/asyncTrackSchemas.js";
import {
	_setAsyncTrackConfigForTesting,
	isAsyncTrackEnabled,
} from "@/internal/misc/edgeConfigs/asyncTrack/asyncTrackStore.js";

afterEach(() => {
	_setAsyncTrackConfigForTesting({ config: { enabledOrgIds: [] } });
});

describe("async track config", () => {
	test("defaults to no enabled orgs", () => {
		expect(AsyncTrackConfigSchema.parse({}).enabledOrgIds).toEqual([]);
	});

	test("matches either org ID or slug", () => {
		_setAsyncTrackConfigForTesting({
			config: { enabledOrgIds: ["org_async", "configured-slug"] },
		});

		expect(isAsyncTrackEnabled({ orgId: "org_async" })).toBe(true);
		expect(
			isAsyncTrackEnabled({
				orgId: "org_other",
				orgSlug: "configured-slug",
			}),
		).toBe(true);
		expect(isAsyncTrackEnabled({ orgId: "org_other" })).toBe(false);
	});
});
