import { describe, expect, test } from "bun:test";
import {
	buildCompactOtelResourceAttributes,
	buildOtelResourceDefinitionAttributes,
	createOtelServiceInstanceId,
} from "@/utils/otel/otelResourceDefinition.js";

describe("OTel resource definition", () => {
	test("generates a compact random process instance id", () => {
		const first = createOtelServiceInstanceId();
		const second = createOtelServiceInstanceId();

		expect(first).toMatch(/^[a-f0-9]{16}$/);
		expect(second).toMatch(/^[a-f0-9]{16}$/);
		expect(first).not.toBe(second);
	});

	test("keeps per-span resource attributes compact and searchable", () => {
		expect(
			buildCompactOtelResourceAttributes({
				serviceInstanceId: "instance_123",
			}),
		).toEqual({
			"service.name": "autumn-server",
			"service.instance.id": "instance_123",
		});
	});

	test("retains full process, host, runtime, and AWS metadata in one definition", () => {
		expect(
			buildOtelResourceDefinitionAttributes({
				serviceInstanceId: "instance_123",
				awsIdentity: {
					serviceArn: "arn:aws:ecs:us-east-2:123:service/cluster/autumn-server",
					imageSha: "abc123",
				},
				runtime: {
					hostArch: "arm64",
					hostName: "task-host",
					processCommand: "/app/server/src/workers.ts",
					processCommandArgs: [
						"/usr/local/bin/bun",
						"/app/server/src/workers.ts",
					],
					processExecutableName: "bun",
					processExecutablePath: "/usr/local/bin/bun",
					processOwner: "unknown",
					processPid: 42,
					runtimeDescription: "Node.js",
					runtimeName: "nodejs",
					runtimeVersion: "24.3.0",
				},
				telemetrySdk: {
					language: "nodejs",
					name: "opentelemetry",
					version: "2.0.1",
				},
			}),
		).toEqual({
			"otel.definition.type": "resource",
			"service.name": "autumn-server",
			"service.instance.id": "instance_123",
			"host.arch": "arm64",
			"host.name": "task-host",
			"process.command": "/app/server/src/workers.ts",
			"process.command_args": [
				"/usr/local/bin/bun",
				"/app/server/src/workers.ts",
			],
			"process.executable.name": "bun",
			"process.executable.path": "/usr/local/bin/bun",
			"process.owner": "unknown",
			"process.pid": 42,
			"process.runtime.description": "Node.js",
			"process.runtime.name": "nodejs",
			"process.runtime.version": "24.3.0",
			"telemetry.sdk.language": "nodejs",
			"telemetry.sdk.name": "opentelemetry",
			"telemetry.sdk.version": "2.0.1",
			"aws.service_arn":
				"arn:aws:ecs:us-east-2:123:service/cluster/autumn-server",
			"aws.image_sha": "abc123",
		});
	});

	test("omits unavailable AWS and optional SDK attributes instead of indexing nulls", () => {
		const attributes = buildOtelResourceDefinitionAttributes({
			serviceInstanceId: "instance_123",
			awsIdentity: {
				serviceArn: null,
				imageSha: null,
			},
			runtime: {
				hostArch: "arm64",
				hostName: "task-host",
				processCommand: "/app/server/src/index.ts",
				processCommandArgs: [],
				processExecutableName: "bun",
				processExecutablePath: "/usr/local/bin/bun",
				processOwner: "unknown",
				processPid: 42,
				runtimeDescription: "Node.js",
				runtimeName: "nodejs",
				runtimeVersion: "24.3.0",
			},
		});

		expect(attributes["aws.service_arn"]).toBeUndefined();
		expect(attributes["aws.image_sha"]).toBeUndefined();
		expect(attributes["telemetry.sdk.language"]).toBeUndefined();
		expect(Object.values(attributes)).not.toContain(null);
		expect(Object.values(attributes)).not.toContain(undefined);
	});
});
