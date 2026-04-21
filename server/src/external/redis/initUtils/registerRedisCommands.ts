import type { Redis } from "ioredis";
import {
	BATCH_DELETE_CUSTOMERS_SCRIPT,
	DELETE_CUSTOMER_SCRIPT,
	GET_CUSTOMER_SCRIPT,
	GET_ENTITY_SCRIPT,
	getBatchDeductionScript,
	SET_CUSTOMER_DETAILS_SCRIPT,
	SET_CUSTOMER_SCRIPT,
	SET_ENTITIES_BATCH_SCRIPT,
	SET_ENTITY_PRODUCTS_SCRIPT,
	SET_GRANTED_BALANCE_SCRIPT,
	SET_INVOICES_SCRIPT,
	SET_SUBSCRIPTIONS_SCRIPT,
} from "../../../_luaScripts/luaScripts.js";
import {
	ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	ADJUST_SUBJECT_BALANCE_SCRIPT,
	APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	CLAIM_LOCK_RECEIPT_SCRIPT,
	DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
	DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	RESET_CUSTOMER_ENTITLEMENTS_SCRIPT,
	SET_CACHED_FULL_SUBJECT_SCRIPT,
	SET_FULL_CUSTOMER_CACHE_SCRIPT,
	UPDATE_CACHED_INVOICE_V2_SCRIPT,
	UPDATE_CUSTOMER_DATA_SCRIPT,
	UPDATE_CUSTOMER_DATA_V2_SCRIPT,
	UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT,
	UPDATE_ENTITY_DATA_V2_SCRIPT,
	UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	UPDATE_SUBJECT_BALANCES_SCRIPT,
	UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
} from "../../../_luaScriptsV2/luaScriptsV2.js";

/** Configure a Redis instance with custom commands */
export const registerRedisCommands = ({
	redisInstance,
}: {
	redisInstance: Redis;
}): Redis => {
	const batchDeductionScript = getBatchDeductionScript();

	redisInstance.defineCommand("batchDeduction", {
		numberOfKeys: 0,
		lua: batchDeductionScript,
	});

	redisInstance.defineCommand("getCustomer", {
		numberOfKeys: 0,
		lua: GET_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("setCustomer", {
		numberOfKeys: 0,
		lua: SET_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("setEntitiesBatch", {
		numberOfKeys: 0,
		lua: SET_ENTITIES_BATCH_SCRIPT,
	});

	redisInstance.defineCommand("getEntity", {
		numberOfKeys: 0,
		lua: GET_ENTITY_SCRIPT,
	});

	redisInstance.defineCommand("setSubscriptions", {
		numberOfKeys: 0,
		lua: SET_SUBSCRIPTIONS_SCRIPT,
	});

	redisInstance.defineCommand("setEntityProducts", {
		numberOfKeys: 0,
		lua: SET_ENTITY_PRODUCTS_SCRIPT,
	});

	redisInstance.defineCommand("setInvoices", {
		numberOfKeys: 0,
		lua: SET_INVOICES_SCRIPT,
	});

	redisInstance.defineCommand("setCustomerDetails", {
		numberOfKeys: 0,
		lua: SET_CUSTOMER_DETAILS_SCRIPT,
	});

	redisInstance.defineCommand("setGrantedBalance", {
		numberOfKeys: 0,
		lua: SET_GRANTED_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("deleteCustomer", {
		numberOfKeys: 0,
		lua: DELETE_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("batchDeleteCustomers", {
		numberOfKeys: 0,
		lua: BATCH_DELETE_CUSTOMERS_SCRIPT,
	});

	redisInstance.defineCommand("deductFromCustomerEntitlements", {
		numberOfKeys: 1,
		lua: DEDUCT_FROM_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("deductFromSubjectBalances", {
		lua: DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	});

	redisInstance.defineCommand("updateSubjectBalances", {
		numberOfKeys: 1,
		lua: UPDATE_SUBJECT_BALANCES_SCRIPT,
	});

	redisInstance.defineCommand("deleteFullCustomerCache", {
		numberOfKeys: 1,
		lua: DELETE_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("setFullCustomerCache", {
		numberOfKeys: 1,
		lua: SET_FULL_CUSTOMER_CACHE_SCRIPT,
	});

	redisInstance.defineCommand("setCachedFullSubject", {
		lua: SET_CACHED_FULL_SUBJECT_SCRIPT,
	});

	redisInstance.defineCommand("resetCustomerEntitlements", {
		numberOfKeys: 1,
		lua: RESET_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerEntitlements", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_ENTITLEMENTS_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerData", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_DATA_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectCustomerDataV2", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_DATA_V2_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectEntityDataV2", {
		numberOfKeys: 1,
		lua: UPDATE_ENTITY_DATA_V2_SCRIPT,
	});

	redisInstance.defineCommand("updateFullSubjectCustomerProductV2", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_PRODUCT_V2_SCRIPT,
	});

	redisInstance.defineCommand("upsertInvoiceInFullSubjectV2", {
		numberOfKeys: 1,
		lua: UPDATE_CACHED_INVOICE_V2_SCRIPT,
	});

	redisInstance.defineCommand("appendEntityToCustomer", {
		numberOfKeys: 1,
		lua: APPEND_ENTITY_TO_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("updateEntityInCustomer", {
		numberOfKeys: 1,
		lua: UPDATE_ENTITY_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("upsertInvoiceInCustomer", {
		numberOfKeys: 1,
		lua: UPSERT_INVOICE_IN_CUSTOMER_SCRIPT,
	});

	redisInstance.defineCommand("adjustCustomerEntitlementBalance", {
		numberOfKeys: 1,
		lua: ADJUST_CUSTOMER_ENTITLEMENT_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("adjustSubjectBalance", {
		numberOfKeys: 1,
		lua: ADJUST_SUBJECT_BALANCE_SCRIPT,
	});

	redisInstance.defineCommand("updateCustomerProduct", {
		numberOfKeys: 1,
		lua: UPDATE_CUSTOMER_PRODUCT_SCRIPT,
	});

	redisInstance.defineCommand("claimLockReceipt", {
		numberOfKeys: 1,
		lua: CLAIM_LOCK_RECEIPT_SCRIPT,
	});

	redisInstance.on("error", (error) => {
		console.error("[Redis] Connection error:", error.message);
	});

	return redisInstance;
};
