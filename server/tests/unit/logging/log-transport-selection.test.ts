/**
 * Contract: which sinks the process logger attaches, and specifically whether it
 * spawns an in-process Axiom transport.
 *
 * The transport is a `pino.transport` worker thread per process — ~90 across the
 * server fleet — each batching JSON and holding a TLS connection to Axiom in JS.
 * The task already runs an `aws-for-fluent-bit` sidecar as its `log_router`, and
 * `firelens.conf` already parses Pino's envelope into the `express` dataset. So
 * writing to stdout lets one C process per task do the shipping instead.
 *
 * LOG_TRANSPORT is an env flag rather than edge config because the logger is
 * constructed at module load, before edge config polling starts.
 */

import { describe, expect, test } from "bun:test";
import { selectLogTransports } from "@/utils/logging/initLogger.js";

describe("selectLogTransports", () => {
	test("keeps the in-process Axiom transport by default", () => {
		expect(
			selectLogTransports({ isDevOrTest: false, axiomToken: "token" }),
		).toEqual(["axiom-transport"]);
	});

	test("ships via stdout when LOG_TRANSPORT=stdout", () => {
		expect(
			selectLogTransports({
				isDevOrTest: false,
				axiomToken: "token",
				logTransport: "stdout",
			}),
		).toEqual(["stdout"]);
	});

	test("drops the transport once shipping via stdout", () => {
		expect(
			selectLogTransports({
				isDevOrTest: false,
				axiomToken: "token",
				logTransport: "stdout",
			}),
		).not.toContain("axiom-transport");
	});

	// Rollout step: run both paths against live traffic so the FireLens output can
	// be compared against the transport's before the transport is removed.
	test("runs both paths when LOG_TRANSPORT=both", () => {
		expect(
			selectLogTransports({
				isDevOrTest: false,
				axiomToken: "token",
				logTransport: "both",
			}),
		).toEqual(["stdout", "axiom-transport"]);
	});

	test("both mode still needs a token for the transport leg", () => {
		expect(
			selectLogTransports({ isDevOrTest: false, logTransport: "both" }),
		).toEqual(["stdout"]);
	});

	test("still emits to stdout when no Axiom token is configured", () => {
		expect(
			selectLogTransports({ isDevOrTest: false, logTransport: "stdout" }),
		).toEqual(["stdout"]);
	});

	test("keeps the formatted stream alongside the transport in dev", () => {
		expect(
			selectLogTransports({ isDevOrTest: true, axiomToken: "token" }),
		).toEqual(["formatted", "axiom-transport"]);
	});

	test("falls back to the formatted stream when nothing else is configured", () => {
		expect(selectLogTransports({ isDevOrTest: false })).toEqual(["formatted"]);
	});

	test("dual mode keeps its own sinks and the transport", () => {
		expect(
			selectLogTransports({
				isDevOrTest: false,
				axiomToken: "token",
				mode: "dual",
			}),
		).toEqual(["console-json", "axiom-transport"]);
	});

	test("dual mode honours the stdout flag too", () => {
		expect(
			selectLogTransports({
				isDevOrTest: false,
				axiomToken: "token",
				mode: "dual",
				logTransport: "stdout",
			}),
		).toEqual(["console-json"]);
	});
});
