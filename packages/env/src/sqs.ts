const DEFAULT_AWS_REGION = "us-east-2";

const trimmed = (value: string | undefined): string | undefined =>
	value?.trim() || undefined;

const urlOrNull = (value: string | undefined): string | null =>
	trimmed(value) ?? null;

/** Every queue a process may send to, by its infra variable; a missing queue is null, never "". */
export function createSqsEnv(runtimeEnv: Record<string, string | undefined>) {
	const accessKeyId = trimmed(runtimeEnv.AWS_ACCESS_KEY_ID);
	const secretAccessKey = trimmed(runtimeEnv.AWS_SECRET_ACCESS_KEY);
	return {
		SQS_REGION: trimmed(runtimeEnv.AWS_REGION) ?? DEFAULT_AWS_REGION,
		/** Static keys only when both are set (the emulator); otherwise the SDK resolves the task role. */
		SQS_CREDENTIALS:
			accessKeyId && secretAccessKey
				? { accessKeyId, secretAccessKey }
				: undefined,
		/** The general queue: every job that is not a track, a balance update, or a reset. */
		SQS_GENERAL_QUEUE_URL: urlOrNull(runtimeEnv.SQS_QUEUE_URL_V2),
		SQS_TRACK_QUEUE_URL: urlOrNull(runtimeEnv.TRACK_SQS_QUEUE_URL),
		SQS_ASYNC_TRACK_STANDARD_QUEUE_URL: urlOrNull(
			runtimeEnv.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
		),
		SQS_ASYNC_TRACK_FIFO_QUEUE_URL: urlOrNull(
			runtimeEnv.TRACK_ASYNC_SQS_QUEUE_URL,
		),
		SQS_UPDATE_BALANCE_QUEUE_URL: urlOrNull(
			runtimeEnv.UPDATE_BALANCE_SQS_QUEUE_URL,
		),
		SQS_CUSTOMER_CREATION_RECOVERY_QUEUE_URL: urlOrNull(
			runtimeEnv.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL,
		),
		SQS_STRIPE_WEBHOOK_QUEUE_URL: urlOrNull(
			runtimeEnv.STRIPE_WEBHOOK_SQS_QUEUE_URL,
		),
		SQS_BATCH_RESET_QUEUE_URL: urlOrNull(runtimeEnv.BATCH_RESET_SQS_QUEUE_URL),
	};
}

export type SqsEnv = ReturnType<typeof createSqsEnv>;
let sqsEnv: SqsEnv | undefined;

/** Read at first use, never at import: env may be injected after import (infisical). */
export function getSqsEnv(): SqsEnv {
	sqsEnv ??= createSqsEnv(process.env);
	return sqsEnv;
}
