import { expect, test } from "bun:test";
import { parseTestOutput } from "./testParse.ts";

const ESC = "\u001b";
const serverLog = (
	time: string,
	level: "INFO" | "WARN" | "ERROR",
	text: string,
) =>
	`${ESC}[90m2026-10-06 ${time}${ESC}[0m ${ESC}[${level === "INFO" ? 32 : 33}m${ESC}[1m${level}${ESC}[0m ${text}`;

/** A timed-out probe's attempt as the sandbox streamed it (org id replaced). */
const timedOutAttempt = [
	"bun test v1.4.2 (744846f84)",
	"--- Setup integration tests ---",
	"",
	"server/tests/_temp/twd-timeout-probe.test.ts:",
	serverLog(
		"17:45:27.477",
		"WARN",
		"[initDrizzle] replica pool budget (880) exceeds 0.85 of replica PgBouncer max_client_conn (1000) — lower REPLICA_DB_POOL_MAX or raise the ceiling.",
	),
	serverLog(
		"17:45:27.502",
		"INFO",
		"[Redis] us-east-2:v2:primary:subject-primary: connecting to redis://localhost:6379",
	),
	serverLog("17:45:27.572", "WARN", "[redis] operation unavailable {"),
	'  "source": "secret-key-cache:clear",',
	'  "reason": "not_ready"',
	"}",
	serverLog(
		"17:45:27.573",
		"WARN",
		'[orgWithFeaturesCache] clear failed on "main" (org: org_123)',
	),
	"Cleared cache for org unit-test-org (org_123)",
	"[Redis] RedisProbe: connected",
	'{"level":"WARN","timestamp":"2026-10-06T17:45:27.792Z","logger":"kafkajs","message":"[Producer] Limiting retries for the idempotent producer may invalidate EoS guarantees"}',
	serverLog(
		"17:45:27.853",
		"ERROR",
		"[balance-worker] Kafka ownership consumer failed to catch up",
	),
	"--- Setup integration tests complete ---",
	"(fail) probe [1001.31ms]",
	"  ^ this test timed out after 1000ms.",
	"",
	" 0 pass",
	" 1 fail",
	"Ran 1 test across 1 file. [2.80s]",
].join("\n");

test("a timed-out test reports bun's timeout, not a server log line printed before it", () => {
	const [probe] = parseTestOutput(timedOutAttempt, "probe.test.ts");
	expect(probe?.status).toBe("failed");
	expect(probe?.error?.message).toBe("Test timed out after 1000ms");
});

test("an assertion failure keeps its message when server logs and colours surround it", () => {
	const output = [
		serverLog("17:45:27.573", "WARN", "[orgWithFeaturesCache] clear failed"),
		`${ESC}[31merror${ESC}[0m: expect(received).toBe(expected)`,
		"",
		"Expected: 200",
		"Received: 500",
		serverLog("17:45:27.574", "ERROR", "[handler] request failed {"),
		'  "error": "boom"',
		"}",
		"      at <anonymous> (/repo/server/tests/billing/attach.test.ts:42:7)",
		"(fail) attach > charges the card [12.00ms]",
	].join("\n");
	const [attach] = parseTestOutput(output, "attach.test.ts");
	expect(attach?.error).toEqual({
		message: "Expected: 200, Received: 500",
		location: "/repo/server/tests/billing/attach.test.ts:42:7",
	});
});

test("a thrown message with no error: prefix is still found past server logs", () => {
	const output = [
		serverLog("17:45:27.573", "WARN", "[cache] clear failed"),
		"Unable to find customer cus_123",
		"(fail) customer lookup [3.00ms]",
	].join("\n");
	const [lookup] = parseTestOutput(output, "lookup.test.ts");
	expect(lookup?.error?.message).toBe("Unable to find customer cus_123");
});
