import "ioredis";

declare module "ioredis" {
	interface RedisCommander {
		batchDeduction(
			requestsJson: string,
			orgId: string,
			env: string,
			customerId: string,
			adjustGrantedBalance?: string,
		): Promise<string>;
		getCustomer(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
			skipEntityMerge: string,
		): Promise<string>;
		setCustomer(
			customerData: string,
			orgId: string,
			env: string,
			customerId: string,
			fetchTimeMs: string,
		): Promise<string>;
		setEntitiesBatch(
			entityBatch: string,
			orgId: string,
			env: string,
		): Promise<string>;
		getEntity(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
			entityId: string,
			skipCustomerMerge: string,
		): Promise<string>;
		setSubscriptions(
			subscriptionsJson: string,
			scheduledSubscriptionsJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setEntityProducts(
			subscriptionsJson: string,
			scheduledSubscriptionsJson: string,
			orgId: string,
			env: string,
			customerId: string,
			entityId: string,
		): Promise<string>;
		setInvoices(
			invoicesJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setCustomerDetails(
			updatesJson: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setGrantedBalance(
			orgId: string,
			env: string,
			customerId: string,
			customerBalancesJson: string,
			entityBatchJson: string,
		): Promise<string>;
		deleteCustomer(
			cacheCustomerVersion: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<number>;
		batchDeleteCustomers(
			cacheCustomerVersion: string,
			customersJson: string,
		): Promise<number>;
		deductFromCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		deductFromSubjectBalances(
			routingKey: string,
			paramsJson: string,
		): Promise<string>;
		updateSubjectBalances(
			balanceKey: string,
			paramsJson: string,
		): Promise<string>;
		deleteFullCustomerCache(
			cacheKey: string,
			orgId: string,
			env: string,
			customerId: string,
			guardTimestamp: string,
			guardTtl: string,
			skipGuard: string,
		): Promise<"SKIPPED" | "DELETED" | "NOT_FOUND">;
		setFullCustomerCache(
			cacheKey: string,
			orgId: string,
			env: string,
			customerId: string,
			fetchTimeMs: string,
			cacheTtl: string,
			serializedData: string,
			overwrite: string,
			pathIndexJson: string,
		): Promise<"STALE_WRITE" | "CACHE_EXISTS" | "OK">;
		reserveFullSubjectWrite(
			subjectKey: string,
			reserveKey: string,
			guardKey: string,
			token: string,
			reserveTtl: string,
			overwrite: string,
			fetchTimeMs: string,
		): Promise<"CACHE_EXISTS" | "RESERVED" | "STALE_WRITE">;
		releaseFullSubjectReservation(
			reserveKey: string,
			token: string,
		): Promise<"RELEASED" | "SKIPPED">;
		resetCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		updateCustomerEntitlements(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		adjustCustomerEntitlementBalance(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		updateCustomerData(cacheKey: string, paramsJson: string): Promise<string>;
		updateFullSubjectCustomerDataV2(
			subjectKey: string,
			updatesJson: string,
			cacheTtlSeconds: string,
			nowMs: string,
		): Promise<string>;
		updateFullSubjectEntityDataV2(
			subjectKey: string,
			updatesJson: string,
			cacheTtlSeconds: string,
			nowMs: string,
		): Promise<string>;
		appendEntityToCustomer(
			cacheKey: string,
			entityJson: string,
		): Promise<string>;
		updateEntityInCustomer(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		upsertInvoiceInCustomer(
			cacheKey: string,
			invoiceJson: string,
		): Promise<string>;
		updateCustomerProduct(
			cacheKey: string,
			paramsJson: string,
		): Promise<string>;
		claimLockReceipt(lockReceiptKey: string): Promise<string | null>;
	}
}
