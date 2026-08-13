import { describe, expect, test } from "bun:test";
import { previewForParkedWrite } from "../../../src/harness/eve/parkedWritePreview.js";

const attachPreview = {
	currency: "usd",
	line_items: [{ display_name: "Pro", total: 20 }],
	total: 20,
};

const captured = {
	preview: attachPreview,
	previewTool: "previewAttach",
};

describe("previewForParkedWrite", () => {
	test("hands the preview to the write it previewed", () => {
		expect(
			previewForParkedWrite({ captured, toolName: "autumn__attach" }),
		).toMatchObject({ total: 20 });
	});

	test("withholds it from a different write in the same turn", () => {
		expect(
			previewForParkedWrite({ captured, toolName: "autumn__createBalance" }),
		).toBeUndefined();
	});

	test("withholds it from a write with no preview tool at all", () => {
		expect(
			previewForParkedWrite({ captured, toolName: "autumn__createEntity" }),
		).toBeUndefined();
	});

	test("has nothing to hand over once the preview was retired", () => {
		expect(
			previewForParkedWrite({
				captured: undefined,
				toolName: "autumn__attach",
			}),
		).toBeUndefined();
	});
});
