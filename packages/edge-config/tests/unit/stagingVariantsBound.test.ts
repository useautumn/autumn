import { expect, test } from "bun:test";
import {
	bindStagingVariants,
	stagingVariantsBound,
} from "../../src/configs/stagingVariants/stagingVariants.js";

test("only the exact staging bucket can bind the telemetry lifecycle", () => {
	bindStagingVariants({
		bucket: "autumn",
		identity: "test",
		read: () => ({ experiments: {} }),
	});
	expect(stagingVariantsBound()).toBe(false);
	bindStagingVariants({
		bucket: "autumn-staging",
		identity: "test",
		read: () => ({ experiments: {} }),
	});
	expect(stagingVariantsBound()).toBe(true);
	bindStagingVariants({
		bucket: "dev",
		identity: "test",
		read: () => ({ experiments: {} }),
	});
	expect(stagingVariantsBound()).toBe(false);
});
