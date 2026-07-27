import { afterEach, describe, expect, test } from "bun:test";
import { AsyncBalanceUpdateConfigSchema } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateSchemas.js";
import {
	_setAsyncBalanceUpdateConfigForTesting,
	isAsyncBalanceUpdateEnabled,
} from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";

describe("async balance update edge config", () => {
	afterEach(() => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: AsyncBalanceUpdateConfigSchema.parse({}),
		});
	});

	test("defaults to no enabled orgs", () => {
		expect(AsyncBalanceUpdateConfigSchema.parse({})).toEqual({
			enabledOrgIds: [],
		});
		expect(isAsyncBalanceUpdateEnabled({ orgId: "org_123" })).toBe(false);
	});

	test("enables listed org IDs and slugs", () => {
		_setAsyncBalanceUpdateConfigForTesting({
			config: { enabledOrgIds: ["org_123", "second-org"] },
		});

		expect(isAsyncBalanceUpdateEnabled({ orgId: "org_123" })).toBe(true);
		expect(
			isAsyncBalanceUpdateEnabled({
				orgId: "org_456",
				orgSlug: "second-org",
			}),
		).toBe(true);
		expect(isAsyncBalanceUpdateEnabled({ orgId: "org_456" })).toBe(false);
	});
});
