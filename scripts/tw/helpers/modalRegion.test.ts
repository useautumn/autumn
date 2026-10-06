import { afterEach, expect, test } from "bun:test";
import { modalRegionMultiplier, modalRegions } from "./modalRegion.ts";

const saved = process.env.TW_MODAL_REGION;
afterEach(() => {
	if (saved === undefined) delete process.env.TW_MODAL_REGION;
	else process.env.TW_MODAL_REGION = saved;
});

test("unset or blank leaves sandboxes unpinned at Modal's base price", () => {
	delete process.env.TW_MODAL_REGION;
	expect(modalRegions()).toBeUndefined();
	expect(modalRegionMultiplier()).toBe(1);
	process.env.TW_MODAL_REGION = " ";
	expect(modalRegions()).toBeUndefined();
	expect(modalRegionMultiplier()).toBe(1);
});

test("a broad pin costs 1.15x and a narrow one 1.75x", () => {
	process.env.TW_MODAL_REGION = "us";
	expect(modalRegions()).toEqual(["us"]);
	expect(modalRegionMultiplier()).toBe(1.15);
	process.env.TW_MODAL_REGION = "us-east-1";
	expect(modalRegionMultiplier()).toBe(1.75);
});

test("a pin spanning broad and narrow regions pays the smaller multiplier", () => {
	process.env.TW_MODAL_REGION = "us-east, eu";
	expect(modalRegions()).toEqual(["us-east", "eu"]);
	expect(modalRegionMultiplier()).toBe(1.15);
});
