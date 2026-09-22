import { createDynamoClient, type DynamoClient } from "@autumn/dynamodb";
import type { BalanceWorkerEnv } from "@autumn/env/balanceWorker";

/** Nothing connects here; the first request does, and an unreachable store fails open at its callers. */
export function createWorkerDynamoClient({
	env,
}: {
	env: Pick<
		BalanceWorkerEnv,
		| "AWS_REGION"
		| "S3_REGION"
		| "DYNAMODB_ENDPOINT"
		| "AWS_ACCESS_KEY_ID"
		| "AWS_SECRET_ACCESS_KEY"
	>;
}): DynamoClient {
	const hasStaticCredentials =
		env.AWS_ACCESS_KEY_ID !== undefined &&
		env.AWS_SECRET_ACCESS_KEY !== undefined;
	return createDynamoClient({
		config: {
			// The table lives beside the admin bucket; MSK auth may leave AWS_REGION unset locally.
			region: env.AWS_REGION ?? env.S3_REGION,
			endpoint: env.DYNAMODB_ENDPOINT,
			...(hasStaticCredentials && {
				credentials: {
					accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
					secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
				},
			}),
		},
	});
}
