import {
	type BillingOperation,
	type BillingOperationAction,
	billingOperations,
} from "@models/billingOperationModels/billingOperationTable";
import { sqlNow } from "@shared/db/utils";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { parseBillingOperationId } from "../billingOperationId";
import {
	hashCanonicalBillingOperationRequest,
	parseCanonicalBillingOperationRequest,
} from "../canonicalBillingOperationRequest";

export type BillingOperationClaimResult =
	| {
			claimed: true;
			operation: BillingOperation;
	  }
	| {
			claimed: false;
			operation: BillingOperation;
			requestMatches: boolean;
			expired: boolean;
	  };

const validateExpiresInMs = (expiresInMs: number): void => {
	if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
		throw new Error("Billing operation expiry must be a positive duration");
	}
};

const classifyExistingOperation = ({
	operation,
	action,
	canonicalRequestHash,
	expired,
}: {
	operation: BillingOperation;
	action: BillingOperationAction;
	canonicalRequestHash: string;
	expired: boolean;
}): Extract<BillingOperationClaimResult, { claimed: false }> => {
	let storedRequestHash: string | null = null;
	try {
		const canonicalStoredRequest = parseCanonicalBillingOperationRequest({
			action: operation.billing_action,
			request: operation.canonical_request,
		});
		storedRequestHash = hashCanonicalBillingOperationRequest({
			action: operation.billing_action,
			canonicalRequest: canonicalStoredRequest,
		});
	} catch {
		storedRequestHash = null;
	}

	return {
		claimed: false,
		operation,
		requestMatches:
			operation.billing_action === action &&
			operation.canonical_request_hash === canonicalRequestHash &&
			operation.canonical_request_hash === storedRequestHash,
		expired,
	};
};

export const claimBillingOperation = async ({
	db,
	orgId,
	env,
	operationId: operationIdInput,
	action,
	request,
	expiresInMs,
}: {
	db: DrizzleCli;
	orgId: string;
	env: string;
	operationId: unknown;
	action: BillingOperationAction;
	request: unknown;
	expiresInMs: number;
}): Promise<BillingOperationClaimResult> => {
	validateExpiresInMs(expiresInMs);
	const operationId = parseBillingOperationId(operationIdInput);
	const canonicalRequest = parseCanonicalBillingOperationRequest({
		action,
		request,
	});
	const canonicalRequestHash = hashCanonicalBillingOperationRequest({
		action,
		canonicalRequest,
	});

	const insertedRows = await db
		.insert(billingOperations)
		.values({
			org_id: orgId,
			env,
			operation_id: operationId,
			billing_action: action,
			canonical_request_hash: canonicalRequestHash,
			canonical_request: canonicalRequest,
			expires_at: sql`${sqlNow} + ${expiresInMs}`,
		})
		.onConflictDoNothing({
			target: [
				billingOperations.org_id,
				billingOperations.env,
				billingOperations.operation_id,
			],
		})
		.returning();
	const inserted = insertedRows[0];
	if (inserted) return { claimed: true, operation: inserted };

	const existingRows = await db
		.select({
			...getTableColumns(billingOperations),
			expired: sql<boolean>`${billingOperations.expires_at} <= ${sqlNow}`,
		})
		.from(billingOperations)
		.where(
			and(
				eq(billingOperations.org_id, orgId),
				eq(billingOperations.env, env),
				eq(billingOperations.operation_id, operationId),
			),
		)
		.limit(1);
	const existing = existingRows[0];
	if (!existing) {
		throw new Error(
			"Billing operation conflict disappeared before it could be read",
		);
	}

	const { expired, ...operation } = existing;
	return classifyExistingOperation({
		operation,
		action,
		canonicalRequestHash,
		expired,
	});
};
