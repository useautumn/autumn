import { expect, test } from "bun:test";
import { sqsClientConfigForQueue } from "../../src/lib/client/createSqsClient.js";

const EMULATOR_QUEUE_URL = "http://localhost:9324/000000000000/autumn.fifo";
const AWS_QUEUE_URL = "https://sqs.us-east-2.amazonaws.com/1/autumn.fifo";

test("an emulator queue without keys still gets static credentials, so the SDK sends", () => {
	expect(
		sqsClientConfigForQueue({
			queueUrl: EMULATOR_QUEUE_URL,
			defaultRegion: "us-east-2",
		}),
	).toEqual({
		region: "us-east-2",
		endpoint: "http://localhost:9324",
		credentials: { accessKeyId: "", secretAccessKey: "" },
	});
});

test("an emulator queue keeps the keys it was given", () => {
	const credentials = { accessKeyId: "key", secretAccessKey: "secret" };
	expect(
		sqsClientConfigForQueue({
			queueUrl: EMULATOR_QUEUE_URL,
			defaultRegion: "us-east-2",
			credentials,
		}).credentials,
	).toEqual(credentials);
});

test("an AWS queue without keys leaves credentials to the SDK's provider chain", () => {
	expect(
		sqsClientConfigForQueue({
			queueUrl: AWS_QUEUE_URL,
			defaultRegion: "us-west-2",
		}),
	).toEqual({
		region: "us-east-2",
		endpoint: undefined,
		credentials: undefined,
	});
});
