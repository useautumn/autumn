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
};
