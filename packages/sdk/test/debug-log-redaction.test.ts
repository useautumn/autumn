import { afterEach, expect, spyOn, test } from "bun:test";
import { resetEnv } from "../src/lib/env.js";
import { Autumn } from "../src/sdk/sdk.js";

const SECRET_KEY = "am_sk_test_debug_redaction";

const startServer = () =>
	Bun.serve({
		port: 0,
		fetch: () => Response.json({ list: [], total: {} }),
	});

const aggregate = (autumn: Autumn) =>
	autumn.events.aggregate({ featureId: "credits", range: "90d" });

afterEach(() => {
	delete process.env.AUTUMN_DEBUG;
	resetEnv();
});

test("a custom debugLogger never receives the secret key", async () => {
	const server = startServer();
	const lines: string[] = [];
	const debugLogger = {
		group: (label?: string) => lines.push(String(label)),
		groupEnd: () => {},
		log: (...args: unknown[]) => lines.push(args.map(String).join(" ")),
	};

	try {
		const autumn = new Autumn({
			secretKey: SECRET_KEY,
			serverURL: `http://127.0.0.1:${server.port}`,
			debugLogger,
		});
		await aggregate(autumn);

		expect(lines.join("\n")).not.toContain(SECRET_KEY);
		expect(lines).toContain("authorization: [REDACTED]");
	} finally {
		await server.stop(true);
	}
});

test("AUTUMN_DEBUG console logging never prints the secret key", async () => {
	const server = startServer();
	process.env.AUTUMN_DEBUG = "true";
	resetEnv();
	const logSpy = spyOn(console, "log").mockImplementation(() => {});
	const groupSpy = spyOn(console, "group").mockImplementation(() => {});
	const groupEndSpy = spyOn(console, "groupEnd").mockImplementation(() => {});

	try {
		const autumn = new Autumn({
			secretKey: SECRET_KEY,
			serverURL: `http://127.0.0.1:${server.port}`,
		});
		await aggregate(autumn);

		const printed = logSpy.mock.calls.flat().map(String).join("\n");
		expect(printed).toContain("[REDACTED]");
		expect(printed).not.toContain(SECRET_KEY);
	} finally {
		logSpy.mockRestore();
		groupSpy.mockRestore();
		groupEndSpy.mockRestore();
		await server.stop(true);
	}
});
