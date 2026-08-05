import "ioredis";

declare module "ioredis" {
	interface RedisCommander {
		deductFromSubjectBalances(
			numberOfKeys: number,
			...keysAndArgs: string[]
		): Promise<string>;
		updateSubjectBalances(
			balanceKey: string,
			paramsJson: string,
		): Promise<string>;
		rollUsageWindows(balanceKey: string, paramsJson: string): Promise<string>;
		setCachedFullSubject(
			numKeys: number,
			...args: string[]
		): Promise<"OK" | "CACHE_EXISTS" | "STALE_WRITE">;
		adjustSubjectBalance(
			balanceKey: string,
			paramsJson: string,
		): Promise<string>;
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
		getDelFullSubjectBalanceFields(
			numKeys: number,
			...args: string[]
		): Promise<string>;
		updateFullSubjectCustomerProductV2(
			subjectKey: string,
			paramsJson: string,
			cacheTtlSeconds: string,
			nowMs: string,
		): Promise<string>;
		upsertInvoiceInFullSubjectV2(
			subjectKey: string,
			invoiceJson: string,
			cacheTtlSeconds: string,
			nowMs: string,
		): Promise<string>;
		deleteOwnedLock(lockKey: string, token: string): Promise<number>;
		refreshOwnedLock(
			lockKey: string,
			token: string,
			ttlMs: string,
		): Promise<number>;
		acquireQueuePermits(
			redisKey: string,
			nowMs: number,
			expiresAtMs: number,
			concurrencyLimit: number,
			requested: number,
			...permitTokens: string[]
		): Promise<number>;
		releaseQueuePermit(redisKey: string, token: string): Promise<number>;
	}
}
