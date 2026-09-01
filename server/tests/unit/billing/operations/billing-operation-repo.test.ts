import { describe, expect, test } from "bun:test";
import {
	type BillingOperation,
	BillingOperationAction,
	BillingOperationState,
	billingOperations,
} from "@models/billingOperationModels/billingOperationTable";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle";
import {
	hashCanonicalBillingOperationRequest,
	parseCanonicalBillingOperationRequest,
} from "@/internal/billing/operations/canonicalBillingOperationRequest";
import { claimBillingOperation } from "@/internal/billing/operations/repos/claimBillingOperation";

const operationRequest = {
	customer_id: "cus_1",
	plan_id: "pro",
};
const canonicalAttachRequest = parseCanonicalBillingOperationRequest({
	action: BillingOperationAction.Attach,
	request: operationRequest,
});
const attachRequestHash = hashCanonicalBillingOperationRequest({
	action: BillingOperationAction.Attach,
	canonicalRequest: canonicalAttachRequest,
});

const operationRow = (
	overrides: Partial<BillingOperation> = {},
): BillingOperation => ({
	org_id: "org_1",
	env: "sandbox",
	operation_id: "operation_1",
	billing_action: BillingOperationAction.Attach,
	canonical_request_hash: attachRequestHash,
	canonical_request: canonicalAttachRequest,
	state: BillingOperationState.Pending,
	created_at: 1_000,
	updated_at: 1_000,
	expires_at: 2_000,
	...overrides,
});

type InsertedBillingOperation = typeof billingOperations.$inferInsert;
type ExistingBillingOperation = BillingOperation & { expired: boolean };
type ConflictConfig = { target: Array<{ name: string }> };

const createDb = ({
	insertResults,
	selectResults = [],
}: {
	insertResults: BillingOperation[][];
	selectResults?: ExistingBillingOperation[][];
}) => {
	const insertedValues: InsertedBillingOperation[] = [];
	const conflictTargets: string[][] = [];
	const selectPredicates: SQL[] = [];
	let expiredExpression: SQL | null = null;
	let insertCalls = 0;
	let selectCalls = 0;

	const db = {
		insert: () => ({
			values: (data: InsertedBillingOperation) => {
				insertedValues.push(data);
				return {
					onConflictDoNothing: (config: ConflictConfig) => {
						conflictTargets.push(config.target.map((column) => column.name));
						return {
							returning: async () => {
								insertCalls += 1;
								return insertResults.shift() ?? [];
							},
						};
					},
				};
			},
		}),
		select: (fields: Record<string, unknown>) => {
			expiredExpression = fields.expired as SQL;
			return {
				from: () => ({
					where: (predicate: SQL) => {
						selectPredicates.push(predicate);
						return {
							limit: async () => {
								selectCalls += 1;
								return selectResults.shift() ?? [];
							},
						};
					},
				}),
			};
		},
	} as unknown as DrizzleCli;

	return {
		db,
		insertedValues,
		conflictTargets,
		selectPredicates,
		getExpiredExpression: () => expiredExpression,
		getInsertCalls: () => insertCalls,
		getSelectCalls: () => selectCalls,
	};
};

const claimAttach = ({
	db,
	orgId = "org_1",
	env = "sandbox",
	operationId = "operation_1",
	request = operationRequest,
}: {
	db: DrizzleCli;
	orgId?: string;
	env?: string;
	operationId?: unknown;
	request?: unknown;
}) =>
	claimBillingOperation({
		db,
		orgId,
		env,
		operationId,
		action: BillingOperationAction.Attach,
		request,
		expiresInMs: 60_000,
	});

const renderSql = (query: SQL): ReturnType<PgDialect["sqlToQuery"]> =>
	new PgDialect().sqlToQuery(query);

describe("billing operation repository", () => {
	test("stores the parsed canonical payload and action-bound hash", async () => {
		const row = operationRow();
		const fake = createDb({ insertResults: [[row]] });

		expect(
			await claimAttach({
				db: fake.db,
				request: {
					plan_id: "pro",
					customer_id: "cus_1",
					ignored_by_schema: "discarded",
				},
			}),
		).toEqual({ claimed: true, operation: row });
		expect(fake.insertedValues[0]).toMatchObject({
			org_id: "org_1",
			env: "sandbox",
			operation_id: "operation_1",
			billing_action: BillingOperationAction.Attach,
			canonical_request_hash: attachRequestHash,
			canonical_request: canonicalAttachRequest,
		});
		expect(fake.conflictTargets).toEqual([
			[
				billingOperations.org_id.name,
				billingOperations.env.name,
				billingOperations.operation_id.name,
			],
		]);
		expect(fake.getSelectCalls()).toBe(0);

		const expirySql = renderSql(
			fake.insertedValues[0]?.expires_at as unknown as SQL,
		);
		expect(expirySql.sql).toContain("date_part('epoch', NOW())");
		expect(expirySql.sql).toContain("+ $1");
		expect(expirySql.params).toEqual([60_000]);
	});

	test("rejects an action-schema mismatch before insertion", async () => {
		const requestFromVariable: unknown = operationRequest;
		const fake = createDb({ insertResults: [] });

		await expect(
			claimBillingOperation({
				db: fake.db,
				orgId: "org_1",
				env: "sandbox",
				operationId: "operation_1",
				action: BillingOperationAction.CreateSchedule,
				request: requestFromVariable,
				expiresInMs: 60_000,
			}),
		).rejects.toThrow();
		expect(fake.getInsertCalls()).toBe(0);
	});

	test("same canonical request converges under concurrent claims", async () => {
		const winner = operationRow();
		const fake = createDb({
			insertResults: [[winner], []],
			selectResults: [[{ ...winner, expired: false }]],
		});

		const results = await Promise.all([
			claimAttach({ db: fake.db }),
			claimAttach({
				db: fake.db,
				request: {
					redirect_mode: "if_required",
					plan_id: "pro",
					customer_id: "cus_1",
				},
			}),
		]);

		expect(results).toContainEqual({ claimed: true, operation: winner });
		expect(results).toContainEqual({
			claimed: false,
			operation: winner,
			requestMatches: true,
			expired: false,
		});
		expect(fake.getInsertCalls()).toBe(2);
		expect(fake.getSelectCalls()).toBe(1);
	});

	test("classifies a cross-action operation ID collision as conflicting", async () => {
		const winner = operationRow();
		const fake = createDb({
			insertResults: [[]],
			selectResults: [[{ ...winner, expired: false }]],
		});

		const result = await claimBillingOperation({
			db: fake.db,
			orgId: "org_1",
			env: "sandbox",
			operationId: "operation_1",
			action: BillingOperationAction.UpdateSubscription,
			request: {
				...operationRequest,
				redirect_mode: "if_required",
			},
			expiresInMs: 60_000,
		});

		expect(result).toEqual({
			claimed: false,
			operation: winner,
			requestMatches: false,
			expired: false,
		});
	});

	test("keeps the same operation ID independent across tenants and environments", async () => {
		const fake = createDb({
			insertResults: [
				[operationRow()],
				[operationRow({ org_id: "org_2" })],
				[operationRow({ env: "production" })],
			],
		});

		await claimAttach({ db: fake.db });
		await claimAttach({ db: fake.db, orgId: "org_2" });
		await claimAttach({ db: fake.db, env: "production" });

		expect(
			fake.insertedValues.map(({ org_id, env, operation_id }) => ({
				org_id,
				env,
				operation_id,
			})),
		).toEqual([
			{ org_id: "org_1", env: "sandbox", operation_id: "operation_1" },
			{ org_id: "org_2", env: "sandbox", operation_id: "operation_1" },
			{ org_id: "org_1", env: "production", operation_id: "operation_1" },
		]);
	});

	test("uses the database clock and treats the expiry boundary as expired", async () => {
		const winner = operationRow({ expires_at: 1_500 });
		const fake = createDb({
			insertResults: [[]],
			selectResults: [[{ ...winner, expired: true }]],
		});

		expect(await claimAttach({ db: fake.db })).toEqual({
			claimed: false,
			operation: winner,
			requestMatches: true,
			expired: true,
		});

		const expiryExpression = fake.getExpiredExpression();
		if (!expiryExpression)
			throw new Error("Expiry expression was not selected");
		const expirySql = renderSql(expiryExpression);
		expect(expirySql.sql).toContain('"billing_operations"."expires_at" <=');
		expect(expirySql.sql).toContain("date_part('epoch', NOW())");

		const lookupSql = renderSql(fake.selectPredicates[0] as SQL);
		expect(lookupSql.sql).toContain('"billing_operations"."org_id" = $1');
		expect(lookupSql.sql).toContain('"billing_operations"."env" = $2');
		expect(lookupSql.sql).toContain('"billing_operations"."operation_id" = $3');
		expect(lookupSql.params).toEqual(["org_1", "sandbox", "operation_1"]);
	});
});
