import type { Price } from "@autumn/shared";
import RecaseError from "@/utils/errorUtils.js";
import { JobName } from "./JobName.js";
import { QueueManager } from "./QueueManager.js";

export interface JobNameToPayloadType {
	[JobName.RewardMigration]: {
		oldPrices: Price[];
		newPrices: Price[];
	};
}

export const addTaskToQueue = async <T extends keyof JobNameToPayloadType>({
	jobName,
	payload,
}: {
	jobName: T;
	payload: JobNameToPayloadType[T];
}) => {
	try {
		const queue = await QueueManager.getQueue({ useBackup: false });
		await queue.add(jobName, payload);
	} catch (error: any) {
		try {
			console.log(`Adding ${jobName} to backup queue`);
			const backupQueue = await QueueManager.getQueue({ useBackup: true });
			await backupQueue.add(jobName, payload);
		} catch (error: any) {
			throw new RecaseError({
				message: `Failed to add ${jobName} to queue (backup)`,
				code: "EVENT_QUEUE_ERROR",
				statusCode: 500,
				data: {
					message: error.message,
				},
			});
		}
	}
};
