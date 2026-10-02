/**
 * Creation recovery jobs: the payload each carries, the queue both ride, and the FIFO ids
 * that keep one subject's replays in order while different subjects run in parallel.
 */

import { describe, expect, test } from "bun:test";
import { ApiVersion, AppEnv } from "@autumn/shared";
import {
	creationRecoveryGroupId,
	customerCreationRecoveryDedupeId,
	customerCreationRecoveryJob,
	entityCreationRecoveryDedupeId,
	entityCreationRecoveryJob,
} from "../../src/jobs/creationRecovery.js";
import { jobCatalogue } from "../../src/jobs/jobs.js";

const customerPayload = {
	orgId: "org_1",
	env: AppEnv.Live,
	customerId: "cus_1",
	requestId: "req_1",
	apiVersion: ApiVersion.V2_1,
	params: {
		customer_id: "cus_1",
		customer_data: { email: "customer@example.com", name: "Customer" },
	},
	withAutumnId: true,
	failureStage: "pre_commit" as const,
	failedAt: 1_785_000_000_000,
};

const entityPayload = {
	orgId: "org_1",
	env: AppEnv.Live,
	customerId: "cus_1",
	requestId: "req_2",
	apiVersion: ApiVersion.V2_1,
	params: {
		customerId: "cus_1",
		createEntityData: [{ id: "ent_1", name: "Seat", feature_id: "seats" }],
	},
	failedAt: 1_785_000_000_000,
};

describe("creation recovery jobs", () => {
	test("both jobs ride the customer creation recovery queue and are in the catalogue", () => {
		expect(customerCreationRecoveryJob.name).toBe("customer-creation-recovery");
		expect(entityCreationRecoveryJob.name).toBe("entity-creation-recovery");
		expect(customerCreationRecoveryJob.queue).toBe("customerCreationRecovery");
		expect(entityCreationRecoveryJob.queue).toBe("customerCreationRecovery");
		expect(jobCatalogue.customerCreationRecovery).toBe(
			customerCreationRecoveryJob,
		);
		expect(jobCatalogue.entityCreationRecovery).toBe(entityCreationRecoveryJob);
	});

	test("a customer payload carries its stage; an entity payload carries none, it replays in full", () => {
		expect(
			customerCreationRecoveryJob.payload.parse(customerPayload),
		).toMatchObject({ failureStage: "pre_commit" });
		expect(() =>
			customerCreationRecoveryJob.payload.parse({
				...customerPayload,
				failureStage: "stripe_invoiced",
			}),
		).toThrow();
		expect(entityCreationRecoveryJob.payload.parse(entityPayload)).toEqual(
			entityPayload,
		);
	});

	test("the group id is one subject: same customer in order, other customers in parallel", () => {
		const groupId = creationRecoveryGroupId({
			orgId: "org_1",
			env: AppEnv.Live,
			customerId: "cus_1",
		});
		expect(groupId).toBe("org_1:live:cus_1");
		expect(
			creationRecoveryGroupId({
				orgId: "org_1",
				env: AppEnv.Live,
				customerId: "cus_2",
			}),
		).not.toBe(groupId);
	});

	test("the dedupe id is the same for the same request at the same stage, and differs by stage", () => {
		const first = customerCreationRecoveryDedupeId({
			payload: customerPayload,
		});
		expect(first).toStartWith("customer-creation-");
		expect(
			customerCreationRecoveryDedupeId({
				payload: { ...customerPayload, requestId: "req_other", failedAt: 1 },
			}),
		).toBe(first);
		expect(
			customerCreationRecoveryDedupeId({
				payload: { ...customerPayload, failureStage: "completed" },
			}),
		).not.toBe(first);

		const entityFirst = entityCreationRecoveryDedupeId({
			payload: entityPayload,
		});
		expect(entityFirst).toStartWith("entity-creation-");
		expect(
			entityCreationRecoveryDedupeId({
				payload: { ...entityPayload, requestId: "req_other" },
			}),
		).toBe(entityFirst);
	});
});
