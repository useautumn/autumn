import { describe, expect, test } from "bun:test";
import {
	ATOM_STORAGE_PER_GIB_LABEL,
	atomMonthlyCost,
	atomStorageMonthlyEstimate,
	atomVolumePresets,
	atomVolumeSize,
} from "@/views/settings/sections/components/atom/atomVolumeDisplay";

const MEDIUM = {
	cpu: 4,
	memory: 8,
	instanceType: "c8g.xlarge",
	container: { cpu: 3, memory: 6 },
	hourlyUsd: 0.15952,
} as const;

describe("Atom storage prices", () => {
	test("each preset is priced for both replicas' volumes", () => {
		expect(
			atomVolumePresets().map((volumeSizeGib) =>
				atomStorageMonthlyEstimate({ volumeSizeGib }),
			),
		).toEqual(["~$3.20", "~$8.00", "~$16.00"]);
		expect(ATOM_STORAGE_PER_GIB_LABEL).toBe("$0.16 / GiB / mo");
	});

	test("the month's estimate splits into compute and storage", () => {
		expect(atomMonthlyCost({ machine: MEDIUM, volumeSizeGib: 50 })).toEqual({
			total: "$241",
			compute: "$233",
			storage: "$8",
		});
	});
});

describe("a typed volume size", () => {
	const typed = (customGib: string, aboveGib?: number) =>
		atomVolumeSize({ choice: { presetGib: null, customGib }, aboveGib });

	test("is a whole GiB within the API's bounds", () => {
		expect(typed("200")).toEqual({ gib: 200, error: null });
		expect(typed("")).toEqual({ gib: null, error: null });
		expect(typed("12.5").error).toBe("Use a whole number of GiB");
		expect(typed("lots").error).toBe("Use a whole number of GiB");
		expect(typed("10").error).toBe("Use at least 20 GiB");
		expect(typed("70000").error).toBe("Use at most 65536 GiB");
	});

	test("must exceed the current size when growing", () => {
		expect(typed("20", 20).error).toBe("Use more than 20 GiB");
		expect(typed("21", 20)).toEqual({ gib: 21, error: null });
	});
});
