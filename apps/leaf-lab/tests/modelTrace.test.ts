import { expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelTraceFetch } from "../lib/modelTrace.js";

test("provider capture preserves split SSE output and usage without request headers", async () => {
	const directory = await mkdtemp(join(tmpdir(), "leaf-model-trace-"));
	const originalFetch = globalThis.fetch;
	const originalDirectory = process.env.LEAF_LAB_REPORT_DIR;
	process.env.LEAF_LAB_REPORT_DIR = directory;
	const output =
		'data: {"id":"response-1","provider":"fixture","choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{}"}}]}}]}\n\ndata: {"usage":{"completion_tokens":61,"completion_tokens_details":{"reasoning_tokens":0}}}\n\ndata: [DONE]\n\n';
	globalThis.fetch = Object.assign(
		async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(output.slice(0, 70)));
						controller.enqueue(new TextEncoder().encode(output.slice(70)));
						controller.close();
					},
				}),
			),
		{ preconnect: originalFetch.preconnect },
	);
	try {
		const response = await modelTraceFetch("https://example.invalid", {
			method: "POST",
			headers: { authorization: "Bearer fixture-secret-never-record" },
			body: JSON.stringify({ model: "fixture:nitro", stream: true }),
		});
		expect(await response.text()).toBe(output);
		const files = await readdir(directory);
		const saved = await Promise.all(
			files.map((file) => readFile(join(directory, file), "utf8")),
		);
		expect(saved.join("\n")).not.toContain("fixture-secret-never-record");
		expect(saved).toContain(output);
		const timingFile = files.find((file) => file.endsWith("-timing.json"));
		if (!timingFile) throw new Error("Missing saved provider timing");
		const timing = JSON.parse(
			await readFile(join(directory, timingFile), "utf8"),
		);
		expect(timing.provider).toBe("fixture");
		expect(timing.usage.completion_tokens).toBe(61);
		expect(timing.firstOutputMs).toBeGreaterThanOrEqual(0);
		expect(timing.completedMs).toBeGreaterThanOrEqual(timing.firstOutputMs);
	} finally {
		globalThis.fetch = originalFetch;
		if (originalDirectory === undefined) delete process.env.LEAF_LAB_REPORT_DIR;
		else process.env.LEAF_LAB_REPORT_DIR = originalDirectory;
		await rm(directory, { recursive: true, force: true });
	}
});
