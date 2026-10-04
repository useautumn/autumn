import { expect, test } from "bun:test";
import {
	bindStagingVariants,
	stagingVariantsBound,
} from "../../src/configs/stagingVariants/stagingVariants.js";

test("only the exact staging bucket can bind the telemetry lifecycle", () => {
	bindStagingVariants({
		bucket: "autumn",
		identity: "test",
		read: () => ({ experiments: {}, updatedAt: "2026-10-04T00:00:00Z" }),
	});
	expect(stagingVariantsBound()).toBe(false);
	bindStagingVariants({
		bucket: "autumn-staging",
		identity: "test",
		read: () => ({ experiments: {}, updatedAt: "2026-10-04T00:00:00Z" }),
	});
	expect(stagingVariantsBound()).toBe(true);
	bindStagingVariants({
		bucket: "dev",
		identity: "test",
		read: () => ({ experiments: {}, updatedAt: "2026-10-04T00:00:00Z" }),
	});
	expect(stagingVariantsBound()).toBe(false);
});
