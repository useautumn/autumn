import { defineS3Connection, secret } from "@tinybirdco/sdk";

export const eventsS3 = defineS3Connection("events_s3", {
	region: "us-east-2",
	accessKey: secret("S3_ACCESS_KEY"),
	secret: secret("S3_SECRET"),
});
