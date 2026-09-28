import { expect, test } from "bun:test";
import { workerDynamoCredentialsOf } from "../../../src/external/dynamodb/createWorkerDynamoClient.js";

const baseEnv = {
	AWS_REGION: undefined,
	S3_REGION: "us-east-2",
	DYNAMODB_ENDPOINT: undefined,
	AWS_ACCESS_KEY_ID: undefined,
	AWS_SECRET_ACCESS_KEY: undefined,
};

test("an emulator endpoint without keys gets placeholder credentials", () => {
	expect(
		workerDynamoCredentialsOf({
			env: { ...baseEnv, DYNAMODB_ENDPOINT: "http://localhost:8000" },
		}),
	).toEqual({ accessKeyId: "local", secretAccessKey: "local" });
});

test("static keys win over the emulator placeholders", () => {
	expect(
		workerDynamoCredentialsOf({
			env: {
				...baseEnv,
				DYNAMODB_ENDPOINT: "http://localhost:8000",
				AWS_ACCESS_KEY_ID: "key",
				AWS_SECRET_ACCESS_KEY: "secret",
			},
		}),
	).toEqual({ accessKeyId: "key", secretAccessKey: "secret" });
});

test("real AWS without keys defers to the SDK's default chain", () => {
	expect(workerDynamoCredentialsOf({ env: baseEnv })).toBeUndefined();
});
