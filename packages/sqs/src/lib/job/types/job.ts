import type { z } from "zod/v4";
import type { QueueName } from "../../../queues/queues.js";

/** A job: its name on the wire, the queue it rides, and the shape of its payload. */
export type JobDefinition<
	TName extends string = string,
	TPayload = unknown,
	TQueue extends QueueName = QueueName,
> = {
	name: TName;
	queue: TQueue;
	payload: z.ZodType<TPayload>;
};

export type JobPayload<TJob extends JobDefinition> = TJob extends JobDefinition<
	string,
	infer TPayload,
	QueueName
>
	? TPayload
	: never;

/** The body every message carries; `data` is the job's payload. */
export type JobEnvelope = {
	id?: string;
	name: string;
	data: unknown;
};

/** A parsed message: which job it is, with its payload already validated. */
export type ParsedJob<TJobs extends readonly JobDefinition[]> = {
	[K in keyof TJobs]: TJobs[K] extends JobDefinition<
		infer TName,
		infer TPayload,
		QueueName
	>
		? { id?: string; name: TName; payload: TPayload }
		: never;
}[number];
