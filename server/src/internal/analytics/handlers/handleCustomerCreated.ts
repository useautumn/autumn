import { ActionType, type AppEnv, type Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { ActionService } from "../ActionService.js";
import { constructAction, parseReqForAction } from "../actionUtils.js";

export const addCustomerCreatedTask = async ({
	req,
	internalCustomerId,
	org,
	env,
}: {
	req: ExtendedRequest;
	internalCustomerId: string;
	org: Organization;
	env: AppEnv;
}) => {
	await addTaskToQueue({
		jobName: JobName.HandleCustomerCreated,
		payload: {
			req: req ? parseReqForAction(req) : undefined,
			internalCustomerId,
			org,
			env,
		},
	});
};

export const handleCustomerCreated = async ({
	db,
	logger,
	data,
}: {
	db: DrizzleCli;
	logger: any;
	data: any;
}) => {
	const { req, internalCustomerId, org, env } = data;

	const customer = await CusService.getFull({
		db,
		idOrInternalId: internalCustomerId,
		orgId: org.id,
		env,
	});

	const action = constructAction({
		org,
		env,
		customer,
		type: ActionType.CustomerCreated,
		req,
		properties: {
			body: data.req.body,
		},
	});

	await ActionService.insert(db, action);
};
