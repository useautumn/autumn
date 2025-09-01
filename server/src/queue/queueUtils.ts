import RecaseError from "@/utils/errorUtils.js";
import { QueueManager } from "./QueueManager.js";

export const addTaskToQueue = async ({
	jobName,
	payload,
}: {
	jobName: string;
	payload: any;
}) => {
	try {
		const queue = await QueueManager.getQueue({ useBackup: false });
		await queue.add(jobName, payload);
	} catch (_error: any) {
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
