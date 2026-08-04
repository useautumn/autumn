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
	}
}
