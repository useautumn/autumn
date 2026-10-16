import { describe, expect, test } from "bun:test";
import { BYOC_CACHE_MACHINES } from "@autumn/shared";
import {
	atomActiveCustomersLabel,
	atomChecksPerSecondLabel,
	atomRecommendedVolumeGib,
} from "../../../src/views/settings/sections/components/atom/atomMachineCapacity";
import { atomMachineLabel } from "../../../src/views/settings/sections/components/atom/atomMachineDisplay";

const byLabel = <T>(
	read: (machine: (typeof BYOC_CACHE_MACHINES)[number]) => T,
) =>
	Object.fromEntries(
		BYOC_CACHE_MACHINES.map((machine) => [
			atomMachineLabel(machine),
			read(machine),
		]),
	);

describe("each Atom size's capacity", () => {
	test("checks per second read as rounded estimates", () => {
		expect(byLabel(atomChecksPerSecondLabel)).toEqual({
			XXS: "~130",
			XS: "~200",
			Small: "~800",
			Medium: "~8k",
			Large: "~14k",
			XL: "~16k",
		});
	});

	test("active customers are round numbers, with ~ where they are extrapolated", () => {
		expect(byLabel(atomActiveCustomersLabel)).toEqual({
			XXS: "250",
			XS: "1.5k",
			Small: "5k",
			Medium: "25k",
			Large: "~50k",
			XL: "~100k",
		});
	});

	test("storage is recommended at 20 GiB up to Medium and 50 GiB for Large and XL", () => {
		expect(byLabel(atomRecommendedVolumeGib)).toEqual({
			XXS: 20,
			XS: 20,
			Small: 20,
			Medium: 20,
			Large: 50,
			XL: 50,
		});
	});
});
