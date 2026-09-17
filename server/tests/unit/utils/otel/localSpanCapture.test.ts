import { afterAll, describe, expect, test } from "bun:test";
import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { LocalSpanExporter } from "../../../../src/utils/otel/localSpanCapture/localSpanExporter.js";
import { resolveTraceMode } from "../../../../src/utils/otel/localSpanCapture/resolveTraceMode.js";

const directory = mkdtempSync(join(homedir(), ".autumn-otel-test-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("local span capture", () => {
	test("preserves disabled and Axiom defaults and requires explicit local opt-in", () => {
		expect(resolveTraceMode({ env: {} })).toBe("disabled");
		expect(resolveTraceMode({ env: { AXIOM_TOKEN: "synthetic" } })).toBe(
			"axiom",
		);
		expect(
			resolveTraceMode({
				env: { AXIOM_TOKEN: "synthetic", AUTUMN_OTEL_LOCAL_DIR: directory },
			}),
		).toBe("axiom");
		expect(() =>
			resolveTraceMode({
				env: {
					AUTUMN_OTEL_LOCAL: "true",
					NODE_ENV: "production",
					AUTUMN_OTEL_LOCAL_DIR: directory,
				},
			}),
		).toThrow("NODE_ENV");
		expect(() =>
			resolveTraceMode({
				env: { AUTUMN_OTEL_LOCAL: "true", NODE_ENV: "development" },
			}),
		).toThrow("AUTUMN_OTEL_LOCAL_DIR");
	});

	test("rejects temporary or relative destinations and creates private unique files", async () => {
		for (const path of [
			"relative",
			"/tmp",
			"/tmp/traces",
			"/tmp/nested/../traces",
		]) {
			expect(() => new LocalSpanExporter({ directory: path })).toThrow(
				"non-/tmp",
			);
		}
		const link = join(directory, "temporary-link");
		symlinkSync("/tmp", link);
		expect(() => new LocalSpanExporter({ directory: link })).toThrow(
			"resolve into /tmp",
		);
		const first = new LocalSpanExporter({ directory });
		const second = new LocalSpanExporter({ directory });
		expect(first.filePath).not.toBe(second.filePath);
		expect(statSync(first.filePath).mode & 0o777).toBe(0o600);
		await first.shutdown();
		await first.shutdown();
		await second.shutdown();
	});

	for (const shutdown of ["explicit", "natural", "signal"]) {
		test(`captures unsampled spans locally and flushes on ${shutdown} shutdown`, async () => {
			const outputDirectory = join(directory, shutdown);
			const source = `
				import { otelSdk } from ${JSON.stringify(resolve(import.meta.dir, "../../../../src/instrumentation.ts"))};
				import { trace, ROOT_CONTEXT, TraceFlags, SpanStatusCode } from "@opentelemetry/api";
				if (!otelSdk) throw new Error("SDK not started");
				const parent = trace.setSpanContext(ROOT_CONTEXT, { traceId: "11111111111111111111111111111111", spanId: "2222222222222222", traceFlags: TraceFlags.NONE });
				const tracer = trace.getTracer("synthetic");
				for (let i = 0; i < 300; i++) {
					const span = tracer.startSpan(i % 2 ? "redis.get" : "dynamodb.claim_idempotency_key", { attributes: {
						"db.system": "redis", "http.request.method": "POST", "http.response.status_code": 200,
						"dynamodb.outcome": "claimed", "db.redis.severe": false,
						"db.statement": "select 'SECRET_MARKER'", "db.params": ["SECRET_MARKER"],
						"http.request.body": "SECRET_MARKER", "authorization": "SECRET_MARKER",
						"customer.id": "SECRET_MARKER", "url.path": "/customers/SECRET_MARKER"
					} }, parent);
					span.setStatus({ code: SpanStatusCode.OK, message: "SECRET_MARKER" });
					span.addEvent("SECRET_MARKER", { payload: "SECRET_MARKER" });
					span.end();
				}
				tracer.startSpan("GET /customers/SECRET_MARKER").end();
				${shutdown === "explicit" ? "await otelSdk.shutdown();" : shutdown === "signal" ? 'process.emit("SIGTERM");' : ""}
			`;
			const child = Bun.spawn([process.execPath, "--eval", source], {
				cwd: resolve(import.meta.dir, "../../../.."),
				env: {
					...process.env,
					DOTENV_CONFIG_PATH: join(directory, "absent.env"),
					NODE_ENV: "test",
					AUTUMN_OTEL_LOCAL: "true",
					AUTUMN_OTEL_LOCAL_DIR: outputDirectory,
					AXIOM_TOKEN: shutdown === "explicit" ? "" : "synthetic",
					AXIOM_METRICS_DATASET: "synthetic",
					OTEL_TRACES_SAMPLER: "always_off",
					OTEL_SDK_DISABLED: "false",
					OTEL_REDIS_SUCCESS_SAMPLE_RATE: "0",
					OTEL_DYNAMO_SUCCESS_SAMPLE_RATE: "0",
				},
				stdout: "pipe",
				stderr: "pipe",
			});
			const [exitCode, stdout, stderr] = await Promise.all([
				child.exited,
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
			]);
			expect({ exitCode, stdout, stderr }).toEqual({
				exitCode: 0,
				stdout: "",
				stderr: "",
			});
			const files = readdirSync(outputDirectory);
			expect(files).toHaveLength(1);
			const output = readFileSync(join(outputDirectory, files[0]), "utf8");
			expect(output).not.toContain("SECRET_MARKER");
			const spans = output
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
			expect(spans).toHaveLength(301);
			const span = spans[0];
			expect(span.traceId).toBe("11111111111111111111111111111111");
			expect(span.parentSpanId).toBe("2222222222222222");
			expect(span.spanId).toMatch(/^[a-f0-9]{16}$/);
			expect(span.name).toBe("dynamodb.claim_idempotency_key");
			expect(span.status).toEqual({ code: 1 });
			expect(span.durationMs).toBeGreaterThanOrEqual(0);
			expect(span.startTime).toHaveLength(2);
			expect(span.endTime).toHaveLength(2);
			expect(span.attributes).toEqual({
				"db.system": "redis",
				"http.request.method": "POST",
				"http.response.status_code": 200,
				"dynamodb.outcome": "claimed",
				"db.redis.severe": false,
			});
			expect(spans[300].name).toMatch(/^redacted\.[a-f0-9]{16}$/);
		});
	}
});
