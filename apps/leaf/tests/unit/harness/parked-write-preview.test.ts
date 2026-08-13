import { describe, expect, test } from "bun:test";
import { previewForParkedWrite } from "../../../src/harness/eve/parkedWritePreview.js";

const attachPreview = {
	currency: "usd",
	line_items: [{ display_name: "Pro", total: 20 }],
	total: 20,
};

const attachRequest = { customer_id: "cus_1", plan_id: "pro" };

const captured = {
	preview: attachPreview,
	previewTool: "previewAttach",
	request: attachRequest,
};

describe("previewForParkedWrite", () => {
	test("hands the preview to the write it previewed", () => {
		expect(
			previewForParkedWrite({
				captured,
				input: { request: attachRequest },
				toolName: "autumn__attach",
			}),
		).toMatchObject({ total: 20 });
	});

	test("matches a request whose keys arrived in a different order", () => {
		expect(
			previewForParkedWrite({
				captured,
				input: { request: { plan_id: "pro", customer_id: "cus_1" } },
				toolName: "autumn__attach",
			}),
		).toMatchObject({ total: 20 });
	});

	test("withholds it from a different write in the same turn", () => {
		expect(
			previewForParkedWrite({
				captured,
				input: { request: attachRequest },
				toolName: "autumn__createBalance",
			}),
		).toBeUndefined();
	});

	test("withholds it from another write sharing the same preview tool", () => {
		const catalogPreview = {
			preview: { plan_changes: [] },
			previewTool: "previewUpdateCatalog",
			request: { plans: [{ plan_id: "pro" }] },
		};

		expect(
			previewForParkedWrite({
				captured: catalogPreview,
				input: { request: { plans: [{ plan_id: "starter" }] } },
				toolName: "autumn__updateCatalog",
			}),
		).toBeUndefined();
	});

	test("withholds it when the preview's own payload went unrecorded", () => {
		expect(
			previewForParkedWrite({
				captured: { preview: attachPreview, previewTool: "previewAttach" },
				input: { request: attachRequest },
				toolName: "autumn__attach",
			}),
		).toBeUndefined();
	});

	test("withholds it when the parked write reports no payload", () => {
		expect(
			previewForParkedWrite({ captured, toolName: "autumn__attach" }),
		).toBeUndefined();
	});

	test("withholds it when neither side reports a payload", () => {
		expect(
			previewForParkedWrite({
				captured: { preview: attachPreview, previewTool: "previewAttach" },
				toolName: "autumn__attach",
			}),
		).toBeUndefined();
	});

	test("withholds it from a write with no preview tool at all", () => {
		expect(
			previewForParkedWrite({
				captured,
				input: { request: attachRequest },
				toolName: "autumn__createEntity",
			}),
		).toBeUndefined();
	});

	test("has nothing to hand over once the preview was retired", () => {
		expect(
			previewForParkedWrite({
				captured: undefined,
				input: { request: attachRequest },
				toolName: "autumn__attach",
			}),
		).toBeUndefined();
	});
});
