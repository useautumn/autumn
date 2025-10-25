import { ActionType, type AppEnv, type Organization } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { HandleCustomerCreatedData } from "@/utils/workerUtils/jobTypes/HandleCustomerCreatedData.js";
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
			orgId: org.id,
			env,
		},
	});
};

export const handleCustomerCreated = async ({
	ctx,
	data,
}: {
	ctx: AutumnContext;
	data: HandleCustomerCreatedData;
}) => {
	const { req, internalCustomerId } = data;
	const { db, org, env } = ctx;

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
