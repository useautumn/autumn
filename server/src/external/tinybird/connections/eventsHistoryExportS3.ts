import { defineS3Connection, secret } from "@tinybirdco/sdk";

// IAM-role S3 connection to the lake landing bucket, used by tinybird/pipes/events_history_export.pipe.
export const eventsHistoryExportS3 = defineS3Connection(
	"s3_export_12oct26_alchemy",
	{
		region: "us-east-2",
		arn: secret("s3_role_arn_s3_export_12oct26_alchemy_2135866d"),
	},
);
