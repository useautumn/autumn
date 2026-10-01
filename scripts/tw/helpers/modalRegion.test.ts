import { expect, test } from "bun:test";
import { modalRegionMultiplier, parseModalRegions } from "./modalRegion.ts";

test("unset or blank TW_MODAL_REGION leaves V2 creates unpinned", () => {
	expect(parseModalRegions({ value: undefined })).toEqual([]);
	expect(parseModalRegions({ value: " " })).toEqual([]);
});

test("TW_MODAL_REGION takes a comma-separated list", () => {
	expect(parseModalRegions({ value: "us-east-1" })).toEqual(["us-east-1"]);
	expect(parseModalRegions({ value: "us, eu " })).toEqual(["us", "eu"]);
});

test("region surcharge follows Modal's broad (1.15x) vs narrow (1.75x) table", () => {
	expect(modalRegionMultiplier({ regions: [] })).toBe(1);
	expect(modalRegionMultiplier({ regions: ["us"] })).toBe(1.15);
	expect(modalRegionMultiplier({ regions: ["us-east-1"] })).toBe(1.75);
	expect(modalRegionMultiplier({ regions: ["uk"] })).toBe(1.75);
});

test("a pin spanning both categories pays the smaller multiplier", () => {
	expect(modalRegionMultiplier({ regions: ["us-east-1", "eu"] })).toBe(1.15);
});
