import { jobCatalogue } from "./jobs/jobs.js";
import {
	createSqsClient,
	sqsClientConfigForQueue,
} from "./lib/client/createSqsClient.js";
import type { SqsClient } from "./lib/client/types/sqsClient.js";
import type { JobDefinition } from "./lib/job/types/job.js";
import { createQueue } from "./lib/queue/createQueue.js";
import type { Queue } from "./lib/queue/types/queue.js";
import { type QueueName, queues } from "./queues/queues.js";
import type {
	JobSender,
	SqsJobs,
	SqsJobsConfig,
	SqsJobsContext,
} from "./types/sqsJobs.js";

type SqsJobsScope = {
	ctx: SqsJobsContext;
	config: SqsJobsConfig;
	/** One client and one queue per queue name, opened on the first send to it. */
	opened: Map<QueueName, { client: SqsClient; queue: Queue }>;
};

/** The jobs a queue carries: what a consumer of that queue parses with. */
export const jobsOnQueue = ({ name }: { name: QueueName }): JobDefinition[] =>
	Object.values(jobCatalogue).filter((definition) => definition.queue === name);

const openQueue = ({
	scope,
	name,
}: {
	scope: SqsJobsScope;
	name: QueueName;
}): Queue => {
	const opened = scope.opened.get(name);
	if (opened) return opened.queue;

	const definition = queues[name];
	const url = definition.url(scope.config.env);
	if (!url) {
		throw new Error(`[sqs] queue "${name}" is not configured in this process`);
	}
	const client = createSqsClient({
		config: sqsClientConfigForQueue({
			queueUrl: url,
			defaultRegion: scope.config.env.SQS_REGION,
			credentials: scope.config.env.SQS_CREDENTIALS,
		}),
	});
	const queue = createQueue({
		ctx: { client, logger: scope.ctx.logger },
		config: { url, batch: definition.batch },
		jobs: jobsOnQueue({ name }),
	});
	scope.opened.set(name, { client, queue });
	return queue;
};

const senderFor = ({
	scope,
	job,
}: {
	scope: SqsJobsScope;
	job: JobDefinition;
}): JobSender<unknown> => ({
	send: async (payload, options) =>
		openQueue({ scope, name: job.queue }).send({ job, payload, options }),
	trySend: async (payload, options) => {
		let queue: Queue;
		try {
			queue = openQueue({ scope, name: job.queue });
		} catch (error) {
			scope.ctx.logger.error("[sqs] send failed; job dropped", {
				error,
				data: { job: job.name, queue: job.queue },
			});
			return { sent: false, error };
		}
		return queue.trySend({ job, payload, options });
	},
});

const flush = async ({ scope }: { scope: SqsJobsScope }): Promise<void> => {
	await Promise.all(
		[...scope.opened.values()].map(({ queue }) => queue.flush()),
	);
};

const shutdown = async ({ scope }: { scope: SqsJobsScope }): Promise<void> => {
	await Promise.all(
		[...scope.opened.values()].map(({ queue }) => queue.shutdown()),
	);
	for (const { client } of scope.opened.values()) client.close();
	scope.opened.clear();
};

/** Every job Autumn queues, bound to this process's queues; a host keeps one of these. */
export const createSqsJobs = ({
	ctx,
	config,
}: {
	ctx: SqsJobsContext;
	config: SqsJobsConfig;
}): SqsJobs => {
	const scope: SqsJobsScope = { ctx, config, opened: new Map() };
	const senders = Object.fromEntries(
		Object.entries(jobCatalogue).map(([key, job]) => [
			key,
			senderFor({ scope, job }),
		]),
	) as { [K in keyof typeof jobCatalogue]: JobSender<unknown> };
	return {
		...(senders as SqsJobs),
		flush: () => flush({ scope }),
		shutdown: () => shutdown({ scope }),
	};
};
