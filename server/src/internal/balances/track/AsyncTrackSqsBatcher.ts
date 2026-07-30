import { JobName } from "@/queue/JobName.js";
import { addTasksToQueueBatch, type Payloads } from "@/queue/queueUtils.js";
import { SqsBatchAccumulator } from "@/queue/SqsBatchAccumulator.js";

type AsyncTrackQueueEntry = {
	payload: Payloads[JobName.Track];
	messageGroupId: string;
	messageDeduplicationId: string;
};

type AsyncTrackAccumulatorEntry = AsyncTrackQueueEntry & {
	queueUrl: string;
	messageBody: string;
};

export type SendAsyncTrackBatchArgs = {
	jobName: JobName.Track;
	queueUrl: string;
	entries: AsyncTrackQueueEntry[];
};

type SendAsyncTrackBatch = (args: SendAsyncTrackBatchArgs) => Promise<{
	successCount: number;
	failures: Array<{ index: number; reason: string }>;
}>;

export class AsyncTrackSqsBatcher {
	private readonly accumulator: SqsBatchAccumulator<AsyncTrackAccumulatorEntry>;

	constructor({
		batchWindowMs,
		sendBatch = addTasksToQueueBatch as SendAsyncTrackBatch,
	}: {
		batchWindowMs?: number;
		sendBatch?: SendAsyncTrackBatch;
	} = {}) {
		this.accumulator = new SqsBatchAccumulator<AsyncTrackAccumulatorEntry>({
			batchWindowMs,
			sendBatch: ({ queueUrl, entries }) =>
				sendBatch({
					jobName: JobName.Track,
					queueUrl,
					entries: entries.map(
						({ payload, messageGroupId, messageDeduplicationId }) => ({
							payload,
							messageGroupId,
							messageDeduplicationId,
						}),
					),
				}),
		});
	}

	enqueue({
		queueUrl,
		payload,
		messageGroupId,
		messageDeduplicationId,
	}: {
		queueUrl: string;
		payload: Payloads[JobName.Track];
		messageGroupId: string;
		messageDeduplicationId: string;
	}): Promise<void> {
		return this.accumulator.enqueue({
			queueUrl,
			payload,
			messageGroupId,
			messageDeduplicationId,
			messageBody: JSON.stringify({
				name: JobName.Track,
				data: payload,
			}),
		});
	}

	flush(): Promise<void> {
		return this.accumulator.flush();
	}

	shutdown(): Promise<void> {
		return this.accumulator.shutdown();
	}
}

export const globalAsyncTrackSqsBatcher = new AsyncTrackSqsBatcher();
