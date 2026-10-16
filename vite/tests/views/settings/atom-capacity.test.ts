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

	test("active customers are plain, with a dagger where they are extrapolated", () => {
		expect(byLabel(atomActiveCustomersLabel)).toEqual({
			XXS: "250",
			XS: "1.5k",
			Small: "6k",
			Medium: "26k",
			Large: "53k†",
			XL: "113k†",
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
