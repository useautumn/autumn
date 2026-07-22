/**
 * Contract: FireLens mode writes complete Pino JSON to stdout without creating
 * an Axiom transport, while direct mode retains the existing Axiom transport.
 */

import { expect, spyOn, test } from "bun:test";
import { Writable } from "node:stream";
import pino from "pino";
import { initLogger } from "@/utils/logging/initLogger.js";

test("logger selects FireLens without changing structured records", () => {
	const previousNodeEnv = process.env.NODE_ENV;
	const previousAxiomToken = process.env.AXIOM_TOKEN;
	const previousLogTransport = process.env.AXIOM_LOG_TRANSPORT;
	const previousEcsMetadataUri = process.env.ECS_CONTAINER_METADATA_URI_V4;
	const stdoutChunks: string[] = [];
	const directChunks: string[] = [];
	const directStream = new Writable({
		write(chunk, _encoding, callback) {
			directChunks.push(chunk.toString());
			callback();
		},
	});
	const stdoutSpy = spyOn(process.stdout, "write").mockImplementation(
		(chunk: string | Uint8Array) => {
			stdoutChunks.push(chunk.toString());
			return true;
		},
	);
	const transportSpy = spyOn(pino, "transport").mockReturnValue(
		directStream as ReturnType<typeof pino.transport>,
	);

	try {
		process.env.NODE_ENV = "production";
		process.env.AXIOM_TOKEN = "test-token";
		process.env.AXIOM_LOG_TRANSPORT = "firelens";
		process.env.ECS_CONTAINER_METADATA_URI_V4 = "http://169.254.170.2/v4/test";

		const firelensLogger = initLogger();
		const responseBody = {
			customer_id: "customer_123",
			balances: {
				messages: {
					remaining: 42,
				},
			},
		};

		firelensLogger.info(
			{
				req: {
					id: "request_123",
					name: "balances.track",
					url: "/v1/balances.track",
				},
				context: {
					org_id: "org_123",
					env: "production",
				},
				res: responseBody,
				statusCode: 200,
				durationMs: 12,
			},
			"Request completed",
		);

		expect(transportSpy).not.toHaveBeenCalled();
		expect(stdoutChunks).toHaveLength(1);

		const firelensRecord = JSON.parse(stdoutChunks[0] ?? "{}");
		expect(firelensRecord).toMatchObject({
			level: "INFO",
			msg: "Request completed",
			req: {
				id: "request_123",
				name: "balances.track",
				url: "/v1/balances.track",
			},
			context: {
				org_id: "org_123",
				env: "production",
			},
			res: responseBody,
			statusCode: 200,
			durationMs: 12,
		});

		process.env.AXIOM_LOG_TRANSPORT = "direct";
		const directLogger = initLogger();
		directLogger.info({ req: { id: "request_456" } }, "Direct request");

		expect(transportSpy).toHaveBeenCalledTimes(1);
		expect(directChunks.join("")).toContain("request_456");

		process.env.AXIOM_LOG_TRANSPORT = "firelens";
		delete process.env.ECS_CONTAINER_METADATA_URI_V4;
		initLogger();
		expect(transportSpy).toHaveBeenCalledTimes(2);
	} finally {
		stdoutSpy.mockRestore();
		transportSpy.mockRestore();
		restoreEnvironmentVariable({
			name: "NODE_ENV",
			previousValue: previousNodeEnv,
		});
		restoreEnvironmentVariable({
			name: "AXIOM_TOKEN",
			previousValue: previousAxiomToken,
		});
		restoreEnvironmentVariable({
			name: "AXIOM_LOG_TRANSPORT",
			previousValue: previousLogTransport,
		});
		restoreEnvironmentVariable({
			name: "ECS_CONTAINER_METADATA_URI_V4",
			previousValue: previousEcsMetadataUri,
		});
	}
});

const restoreEnvironmentVariable = ({
	name,
	previousValue,
}: {
	name: string;
	previousValue: string | undefined;
}) => {
	if (previousValue === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = previousValue;
};
