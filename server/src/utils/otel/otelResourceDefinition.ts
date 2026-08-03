import { randomBytes } from "node:crypto";
import { hostname, userInfo } from "node:os";
import { basename } from "node:path";
import type { Attributes } from "@opentelemetry/api";
import type { AwsTaskIdentity } from "@/external/aws/ecs/awsTaskIdentity.js";

type RuntimeMetadata = {
	hostArch: string;
	hostName: string;
	processCommand: string;
	processCommandArgs: string[];
	processExecutableName: string;
	processExecutablePath: string;
	processOwner: string;
	processPid: number;
	runtimeDescription: string;
	runtimeName: string;
	runtimeVersion: string;
};

type TelemetrySdkMetadata = {
	language: string;
	name: string;
	version: string;
};

const getProcessOwner = () => {
	try {
		return userInfo().username;
	} catch {
		return "unknown";
	}
};

const getRuntimeMetadata = (): RuntimeMetadata => ({
	hostArch: process.arch,
	hostName: hostname(),
	processCommand: process.argv[1] ?? process.argv[0] ?? "",
	processCommandArgs: [...process.argv],
	processExecutableName: basename(process.execPath),
	processExecutablePath: process.execPath,
	processOwner: getProcessOwner(),
	processPid: process.pid,
	runtimeDescription: "Node.js",
	runtimeName: "nodejs",
	runtimeVersion: process.versions.node,
});

export const createOtelServiceInstanceId = () => randomBytes(8).toString("hex");

export const buildCompactOtelResourceAttributes = ({
	serviceInstanceId,
}: {
	serviceInstanceId: string;
}): Attributes => ({
	"service.name": "autumn-server",
	"service.instance.id": serviceInstanceId,
});

export const buildOtelResourceDefinitionAttributes = ({
	serviceInstanceId,
	awsIdentity,
	runtime = getRuntimeMetadata(),
	telemetrySdk,
}: {
	serviceInstanceId: string;
	awsIdentity?: AwsTaskIdentity;
	runtime?: RuntimeMetadata;
	telemetrySdk?: TelemetrySdkMetadata;
}): Attributes => ({
	"otel.definition.type": "resource",
	"service.name": "autumn-server",
	"service.instance.id": serviceInstanceId,
	"host.arch": runtime.hostArch,
	"host.name": runtime.hostName,
	"process.command": runtime.processCommand,
	"process.command_args": runtime.processCommandArgs,
	"process.executable.name": runtime.processExecutableName,
	"process.executable.path": runtime.processExecutablePath,
	"process.owner": runtime.processOwner,
	"process.pid": runtime.processPid,
	"process.runtime.description": runtime.runtimeDescription,
	"process.runtime.name": runtime.runtimeName,
	"process.runtime.version": runtime.runtimeVersion,
	...(telemetrySdk
		? {
				"telemetry.sdk.language": telemetrySdk.language,
				"telemetry.sdk.name": telemetrySdk.name,
				"telemetry.sdk.version": telemetrySdk.version,
			}
		: {}),
	...(awsIdentity?.serviceArn
		? { "aws.service_arn": awsIdentity.serviceArn }
		: {}),
	...(awsIdentity?.imageSha ? { "aws.image_sha": awsIdentity.imageSha } : {}),
});
