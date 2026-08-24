import os from "node:os";

import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";
import {
	flushLogger,
	type Logger,
	logger,
} from "@/external/logtail/logtailUtils.js";

const PROD_QUEUE_EVENT = "prod_sqs_worker_outside_ecs";
const QUEUE_URL_ENV_KEYS = [
	"SQS_QUEUE_URL_V2",
	"TRACK_ASYNC_STANDARD_SQS_QUEUE_URL",
	"TRACK_ASYNC_SQS_QUEUE_URL",
	"UPDATE_BALANCE_SQS_QUEUE_URL",
] as const;

const queueNameFromUrl = (url: string): string => {
	const parts = url.split("/").filter(Boolean);
	const name = parts[parts.length - 1] ?? url;
	try {
		return decodeURIComponent(name);
	} catch {
		return name;
	}
};

export const productionWorkerQueueNames = ({
	env,
}: {
	env: NodeJS.ProcessEnv;
}): string[] => {
	const queueNames = QUEUE_URL_ENV_KEYS.flatMap((key) => {
		const queueUrl = env[key];
		return queueUrl ? [queueNameFromUrl(queueUrl)] : [];
	});
	const usesProdEnvFile = env.ENV_FILE?.endsWith(".env.prod") ?? false;

	if (usesProdEnvFile) return [...new Set(queueNames)];
	return [
		...new Set(
			queueNames.filter((name) => /(^|[-_.])prod($|[-_.])/i.test(name)),
		),
	];
};

export const assertSqsWorkerRuntime = async ({
	env = process.env,
	isEcs = onAwsEcs(),
	workerLogger = logger,
	flush = flushLogger,
}: {
	env?: NodeJS.ProcessEnv;
	isEcs?: boolean;
	workerLogger?: Logger;
	flush?: () => Promise<void>;
} = {}): Promise<void> => {
	if (isEcs) return;

	const queues = productionWorkerQueueNames({ env });
	if (queues.length === 0) return;

	workerLogger.error("Blocked production SQS worker outside ECS", {
		type: PROD_QUEUE_EVENT,
		queues,
		host: os.hostname(),
		pid: process.pid,
		cwd: process.cwd(),
		command: process.argv.join(" "),
		env_file: env.ENV_FILE ?? "",
	});
	await flush();

	throw new Error(
		`Refusing to start a production SQS worker outside ECS (${queues.join(", ")})`,
	);
};
