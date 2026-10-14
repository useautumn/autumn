import {
	ApiVersion,
	AppEnv,
	BillingDetailsParamsSchema,
	CreateEntityParamsV0Schema,
	CustomerDataSchema,
	EntityDataSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { job } from "../lib/job/job.js";
import type { JobPayload } from "../lib/job/types/job.js";

const customerCreationRecoveryStage = z.enum([
	"lookup",
	"pre_commit",
	"existing",
	"autumn_committed",
	"completed",
]);

const creationRecoveryBase = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	requestId: z.string(),
	apiVersion: z.enum(ApiVersion),
	failedAt: z.number(),
});

export const customerCreationRecoveryJob = job({
	name: "customer-creation-recovery",
	queue: "customerCreationRecovery",
	payload: creationRecoveryBase.extend({
		customerId: z.string().optional(),
		params: z.object({
			customer_id: z.string().nullable(),
			customer_data: CustomerDataSchema.optional(),
			entity_id: z.string().nullish(),
			entity_data: EntityDataSchema.optional(),
		}),
		billingDetails: BillingDetailsParamsSchema.optional(),
		source: z.string().optional(),
		withAutumnId: z.boolean().optional(),
		failureStage: customerCreationRecoveryStage,
	}),
});

export const entityCreationRecoveryJob = job({
	name: "entity-creation-recovery",
	queue: "customerCreationRecovery",
	payload: creationRecoveryBase.extend({
		customerId: z.string(),
		params: z.object({
			customerId: z.string(),
			customerData: CustomerDataSchema.optional(),
			createEntityData: z.union([
				CreateEntityParamsV0Schema,
				z.array(CreateEntityParamsV0Schema),
			]),
			withAutumnId: z.boolean().optional(),
		}),
	}),
});

export type CustomerCreationRecoveryJobPayload = JobPayload<
	typeof customerCreationRecoveryJob
>;
export type EntityCreationRecoveryJobPayload = JobPayload<
	typeof entityCreationRecoveryJob
>;

export const creationRecoveryGroupId = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: AppEnv;
	customerId?: string;
}): string => `${orgId}:${env}:${customerId ?? ""}`;

const dedupeId = ({ prefix, fields }: { prefix: string; fields: unknown }) =>
	`${prefix}-${Bun.hash(JSON.stringify(fields)).toString(16)}`;

export const customerCreationRecoveryDedupeId = ({
	payload,
}: {
	payload: CustomerCreationRecoveryJobPayload;
}): string =>
	dedupeId({
		prefix: "customer-creation",
		fields: {
			orgId: payload.orgId,
			env: payload.env,
			apiVersion: payload.apiVersion,
			params: payload.params,
			billingDetails: payload.billingDetails,
			withAutumnId: payload.withAutumnId,
			failureStage: payload.failureStage,
		},
	});

export const entityCreationRecoveryDedupeId = ({
	payload,
}: {
	payload: EntityCreationRecoveryJobPayload;
}): string =>
	dedupeId({
		prefix: "entity-creation",
		fields: {
			orgId: payload.orgId,
			env: payload.env,
			apiVersion: payload.apiVersion,
			params: payload.params,
		},
	});
