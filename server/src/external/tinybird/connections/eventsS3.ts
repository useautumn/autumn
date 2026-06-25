import { defineS3Connection, secret } from "@tinybirdco/sdk";

// S3 connection for the events sink (tinybird/pipes/events_sink_s3.pipe), which
// exports the events datasource to S3 for the RisingWave → Iceberg → BigQuery lane.
// Key/secret auth (S3_ACCESS_KEY/S3_SECRET) avoids the IAM-role external-id dance.
export const eventsS3 = defineS3Connection("events_s3", {
	region: "us-east-2",
	accessKey: secret("S3_ACCESS_KEY"),
	secret: secret("S3_SECRET"),
});
