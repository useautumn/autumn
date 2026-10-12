import { describe, expect, test } from "bun:test";
import { billingEdgeUrl } from "@/external/autumn/billingEdgeUrl.js";

const EDGE_URL = "https://atom.example.com";

describe("billingEdgeUrl (path for Autumn's own billing checks)", () => {
	test("on ECS with AUTUMN_EDGE_URL, checks go to the edge", () => {
		expect(billingEdgeUrl({ onEcs: true, edgeUrl: EDGE_URL })).toBe(EDGE_URL);
	});

	test("on ECS without AUTUMN_EDGE_URL, checks go to the API", () => {
		expect(billingEdgeUrl({ onEcs: true, edgeUrl: undefined })).toBeUndefined();
	});

	test("off ECS, checks go to the API even with AUTUMN_EDGE_URL", () => {
		expect(billingEdgeUrl({ onEcs: false, edgeUrl: EDGE_URL })).toBeUndefined();
	});
});
