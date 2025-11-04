import type { AppEnv, EventInsert, Price } from "@autumn/shared";
import { queue } from "./initQueue.js";
import { JobName } from "./JobName.js";

export interface Payloads {
	[JobName.RewardMigration]: {
		oldPrices: Price[];
		productId: string;
		// newPrices: Price[];
		// product: FullProduct;
		orgId: string;
		env: AppEnv;
	};
	[JobName.SyncBalanceBatch]: {
		items: Array<{
			customerId: string;
			featureId: string;
			orgId: string;
			env: string;
			entityId?: string;
		}>;
	};
	[JobName.InsertEventBatch]: {
		events: EventInsert[];
	};
	[key: string]: any;
}

export const addTaskToQueue = async <T extends keyof Payloads>({
	jobName,
	payload,
}: {
	jobName: T;
	payload: Payloads[T];
}) => {
	await queue.add(jobName as string, payload);
	// try {
	// 	const queue = await QueueManager.getQueue({ useBackup: false });
	// 	await queue.add(jobName as string, payload);
	// } catch (error: any) {
	// 	try {
	// 		console.log(`Adding ${jobName} to backup queue`);
	// 		const backupQueue = await QueueManager.getQueue({ useBackup: true });
	// 		await backupQueue.add(jobName as string, payload);
	// 	} catch (error: any) {
	// 		throw new RecaseError({
	// 			message: `Failed to add ${jobName} to queue (backup)`,
	// 			code: "EVENT_QUEUE_ERROR",
	// 			statusCode: 500,
	// 			data: {
	// 				message: error.message,
	// 			},
	// 		});
	// 	}
	// }
};
