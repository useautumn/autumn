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

/** Where the request was when it failed; `autumn_committed` is past the point a replay may repeat. */
const customerCreationRecoveryStage = z.enum([
	"lookup",
	"pre_commit",
	"existing",
	"autumn_committed",
	"completed",
]);

/** Seats are invoiced before any row is written: past `stripe_invoiced`, a replay would charge again. */
const entityCreationRecoveryStage = z.enum(["pre_commit", "stripe_invoiced"]);

const creationRecoveryBase = z.object({
	orgId: z.string(),
	env: z.enum(AppEnv),
	requestId: z.string(),
	apiVersion: z.enum(ApiVersion),
	failedAt: z.number(),
});

/** The validated get-or-create request; replay hands it back to the same action a live request uses. */
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

/** The validated entities.create request, replayed through the same batch create. */
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
		failureStage: entityCreationRecoveryStage,
	}),
});

export type CustomerCreationRecoveryJobPayload = JobPayload<
	typeof customerCreationRecoveryJob
>;
export type EntityCreationRecoveryJobPayload = JobPayload<
	typeof entityCreationRecoveryJob
>;

/** One FIFO group per subject: a customer's replays land in failure order, other customers run beside it. */
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

/** The same request failing at the same stage is one message, whichever attempt enqueues first. */
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
			failureStage: payload.failureStage,
		},
	});
