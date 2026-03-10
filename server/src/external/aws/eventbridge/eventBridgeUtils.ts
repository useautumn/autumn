import {
	CreateScheduleCommand,
	DeleteScheduleCommand,
	ResourceNotFoundException,
} from "@aws-sdk/client-scheduler";
import { logger } from "@/external/logtail/logtailUtils.js";
import { schedulerClient } from "./initEventBridge.js";

const SCHEDULE_GROUP = "default";
const SCHEDULER_ROLE_ARN = process.env.AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN || "";

/** Derives SQS ARN from URL: https://sqs.<region>.amazonaws.com/<account>/<name> -> arn:aws:sqs:<region>:<account>:<name> */
const getSqsQueueArn = (): string => {
	const url = process.env.SQS_QUEUE_URL || "";
	const match = url.match(
		/^https:\/\/sqs\.([a-z0-9-]+)\.amazonaws\.com\/(\d+)\/(.+)$/,
	);
	if (!match)
		throw new Error(`Cannot derive SQS ARN from SQS_QUEUE_URL: ${url}`);
	const [, region, accountId, queueName] = match;
	return `arn:aws:sqs:${region}:${accountId}:${queueName}`;
};

/** Creates a one-shot EventBridge schedule that delivers an SQS message at scheduleAt */
export const createSchedule = async ({
	scheduleName,
	scheduleAt,
	sqsMessageBody,
	messageGroupId,
}: {
	scheduleName: string;
	scheduleAt: Date;
	sqsMessageBody: string;
	messageGroupId: string;
}) => {
	// EventBridge at-expression: at(yyyy-mm-ddThh:mm:ss)
	const pad = (n: number) => String(n).padStart(2, "0");
	const d = scheduleAt;
	const atExpression = `at(${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())})`;

	const sqsArn = getSqsQueueArn();
	logger.info(
		`[EventBridge] Creating schedule: name=${scheduleName} arn=${sqsArn} at=${atExpression}`,
	);

	await schedulerClient.send(
		new CreateScheduleCommand({
			Name: scheduleName,
			GroupName: SCHEDULE_GROUP,
			ScheduleExpression: atExpression,
			ScheduleExpressionTimezone: "UTC",
			FlexibleTimeWindow: { Mode: "OFF" },
			Target: {
				Arn: sqsArn,
				RoleArn: SCHEDULER_ROLE_ARN,
				Input: sqsMessageBody,
				SqsParameters: {
					MessageGroupId: messageGroupId,
				},
			},
			// Auto-delete after firing so schedules don't accumulate
			ActionAfterCompletion: "DELETE",
		}),
	);
};

/** Deletes an EventBridge schedule by name. Silently ignores not-found errors. */
export const deleteSchedule = async ({
	scheduleName,
}: {
	scheduleName: string;
}) => {
	try {
		await schedulerClient.send(
			new DeleteScheduleCommand({
				Name: scheduleName,
				GroupName: SCHEDULE_GROUP,
			}),
		);
	} catch (error) {
		if (error instanceof ResourceNotFoundException) return;
		throw error;
	}
};
