/**
 * TDD: discarding a pending plan whose checkout session already completed at
 * Stripe must not delete the deferred metadata or expire the row, otherwise the
 * checkout.session.completed webhook finds nothing and the paid plan is lost.
 *
 * Red-failure mode (current behavior):
 *  - expireAndClearIfOwned returns false, cleanup runs anyway, no error.
 *
 * Green-success criteria (after fix):
 *  - a 423 conflict is thrown before any cleanup.
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	type CusProductStatus,
	ErrCode,
	type FullCusProduct,
	RecaseError,
} from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const state = {
	sessionExpired: true,
	expiredSessionIds: [] as string[],
	deletedMetadataIds: [] as string[],
	expiredCustomerProductIds: [] as string[],
};

const metadataId = "meta_pending_checkout";
const checkoutSessionId = "cs_test_pending_checkout";

await mockModuleWithRestore(
	"@/external/redis/actions/checkoutSessionLock/checkoutSessionLock.js",
	() => ({
		checkoutSessionLock: {
			expireAndClearIfOwned: async ({
				checkoutSessionId: sessionId,
			}: {
				checkoutSessionId: string;
			}) => {
				state.expiredSessionIds.push(sessionId);
				return state.sessionExpired;
			},
		},
	}),
);

await mockModuleWithRestore("@/internal/metadata/MetadataService.js", () => ({
	MetadataService: {
		get: async () => ({
			id: metadataId,
			stripe_checkout_session_id: checkoutSessionId,
			stripe_invoice_id: null,
			data: {
				billingContext: {
					fullCustomer: { id: "cus_pending_checkout", internal_id: "icus_1" },
				},
			},
		}),
		delete: async ({ id }: { id: string }) => {
			state.deletedMetadataIds.push(id);
		},
	},
}));

await mockModuleWithRestore(
	"@/internal/customers/cusProducts/CusProductService.js",
	() => ({
		CusProductService: {
			expireIfPending: async ({ cusProductId }: { cusProductId: string }) => {
				state.expiredCustomerProductIds.push(cusProductId);
			},
		},
	}),
);

const { discardPendingCustomerProduct } = await import(
	"@/internal/billing/v2/execute/discardPendingCustomerProduct.js"
);

const customerProduct = {
	id: "cp_pending_checkout",
	internal_customer_id: "icus_1",
	metadata_id: metadataId,
	status: "pending" as CusProductStatus,
} as unknown as FullCusProduct;

const ctx = {
	db: {} as never,
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as never;

const resetState = () => {
	state.sessionExpired = true;
	state.expiredSessionIds = [];
	state.deletedMetadataIds = [];
	state.expiredCustomerProductIds = [];
};

test("discards the pending plan once its checkout session is expired", async () => {
	resetState();

	await discardPendingCustomerProduct({ ctx, customerProduct });

	expect(state.expiredSessionIds).toEqual([checkoutSessionId]);
	expect(state.deletedMetadataIds).toEqual([metadataId]);
	expect(state.expiredCustomerProductIds).toEqual([customerProduct.id]);
});

test("refuses to discard when the checkout session already completed", async () => {
	resetState();
	state.sessionExpired = false;

	let thrown: unknown;
	try {
		await discardPendingCustomerProduct({ ctx, customerProduct });
	} catch (error) {
		thrown = error;
	}

	expect(thrown).toBeInstanceOf(RecaseError);
	expect((thrown as RecaseError).statusCode).toBe(423);
	expect((thrown as RecaseError).code).toBe(ErrCode.LockAlreadyExists);
	expect(state.deletedMetadataIds).toEqual([]);
	expect(state.expiredCustomerProductIds).toEqual([]);
});
