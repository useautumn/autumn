import type { z } from "zod/v4";
import type { QueueName } from "../../queues/queues.js";
import type { JobDefinition } from "./types/job.js";

export const job = <TName extends string, TPayload, TQueue extends QueueName>({
	name,
	queue,
	payload,
}: {
	name: TName;
	queue: TQueue;
	payload: z.ZodType<TPayload>;
}): JobDefinition<TName, TPayload, TQueue> => ({ name, queue, payload });
