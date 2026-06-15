import { describe, expect, test } from "bun:test";
import {
	errorStatusLine,
	toolStatusLine,
} from "../../../src/internal/approvals/utils/approvalProgress.js";
import { createThrottledCardEditor } from "../../../src/ui/throttledEditor.js";

describe("toolStatusLine", () => {
	test("maps known tools to human status lines", () => {
		expect(toolStatusLine("attach")).toBe("Attaching the plan…");
		expect(toolStatusLine("autumn_previewAttach")).toBe("Re-checking pricing…");
		expect(toolStatusLine("configureWebhooks")).toBe("Configure Webhooks…");
	});
});

describe("errorStatusLine", () => {
	test("returns null for successful results", () => {
		expect(errorStatusLine({ content: [], isError: false })).toBeNull();
	});

	test("extracts and truncates error messages", () => {
		const line = errorStatusLine({
			isError: true,
			content: [
				{
					type: "text",
					text: JSON.stringify({
						id: "TOOL_EXECUTION_FAILED",
						details: { errorMessage: "server URL not found" },
					}),
				},
			],
		});
		expect(line).toBe("Retrying — server URL not found");

		const long = errorStatusLine({
			isError: true,
			content: [{ type: "text", text: "x".repeat(400) }],
		});
		expect(long?.length).toBeLessThanOrEqual("Retrying — ".length + 120);
	});
});

describe("createThrottledCardEditor", () => {
	test("edits immediately, coalesces bursts, and stops after finalize", async () => {
		let edits = 0;
		const editor = createThrottledCardEditor({
			edit: async () => {
				edits += 1;
			},
			minIntervalMs: 40,
		});

		editor.requestEdit();
		expect(edits).toBe(1);

		editor.requestEdit();
		editor.requestEdit();
		editor.requestEdit();
		expect(edits).toBe(1);
		await Bun.sleep(60);
		expect(edits).toBe(2);

		editor.requestEdit();
		await editor.finalize();
		editor.requestEdit();
		await Bun.sleep(60);
		expect(edits).toBe(2);
	});
});
