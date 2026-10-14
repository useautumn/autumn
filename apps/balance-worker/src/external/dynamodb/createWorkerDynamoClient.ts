import { createDynamoClient, type DynamoClient } from "@autumn/dynamodb";
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";

type WorkerDynamoEnv = Pick<
	BalanceWorkerEnv,
	| "AWS_REGION"
	| "S3_REGION"
	| "DYNAMODB_ENDPOINT"
	| "AWS_ACCESS_KEY_ID"
	| "AWS_SECRET_ACCESS_KEY"
>;

export const workerDynamoCredentialsOf = ({
	env,
}: {
	env: WorkerDynamoEnv;
}): { accessKeyId: string; secretAccessKey: string } | undefined => {
	const hasStaticCredentials =
		env.AWS_ACCESS_KEY_ID !== undefined &&
		env.AWS_SECRET_ACCESS_KEY !== undefined;
	if (hasStaticCredentials)
		return {
			accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
		};
	if (env.DYNAMODB_ENDPOINT)
		return { accessKeyId: "local", secretAccessKey: "local" };
	return undefined;
};

export function createWorkerDynamoClient({
	env,
}: {
	env: WorkerDynamoEnv;
}): DynamoClient {
	const credentials = workerDynamoCredentialsOf({ env });
	return createDynamoClient({
		config: {
			region: env.AWS_REGION ?? env.S3_REGION,
			endpoint: env.DYNAMODB_ENDPOINT,
			...(credentials && { credentials }),
		},
	});
}
