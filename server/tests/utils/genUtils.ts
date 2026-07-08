import type { CusProductStatus, FullCusProduct } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli.js";

export const timeout = (ms: number) => {
	return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Polls `fetch` until `until(value)` holds or the deadline passes; returns the
 * last value (or rethrows the last error) so asserts surface the real mismatch.
 */
export const pollUntil = async <T>({
	fetch,
	until,
	timeoutMs = 60_000,
	intervalMs = 500,
}: {
	fetch: () => Promise<T>;
	until: (value: T) => boolean;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<T> => {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const isLastAttempt = Date.now() >= deadline;
		try {
			const value = await fetch();
			if (until(value) || isLastAttempt) return value;
		} catch (error) {
			if (isLastAttempt) throw error;
		}
		await timeout(intervalMs);
	}
};

export const batchSendCountEvents = async ({
	customerId,
	eventCount,
	featureId,
}: {
	customerId: string;
	eventCount: number;
	featureId: string;
}) => {
	const batchEvents = [];
	for (let i = 0; i < eventCount; i++) {
		batchEvents.push(
			AutumnCli.sendEvent({
				customerId: customerId,
				eventName: featureId,
			}),
		);
	}

	await Promise.all(batchEvents);
	await timeout(10000);
};

export const searchCusProducts = ({
	productId,
	cusProducts,
	status,
}: {
	productId: string;
	cusProducts: FullCusProduct[];
	status?: CusProductStatus;
}) => {
	if (!cusProducts) {
		return undefined;
	}
	return cusProducts.find(
		(cusProduct: FullCusProduct) =>
			cusProduct.product.id === productId &&
			(status ? cusProduct.status === status : true),
	);
};

export const getFixedPriceAmount = (product: any) => {
	let amount = 0;
	for (const price of product.prices) {
		if (price.config.type === "fixed") {
			amount += price.config.amount;
		}
	}
	return amount;
};

export const getUsagePriceTiers = ({
	product,
	featureId,
}: {
	product: any;
	featureId: string;
}) => {
	for (const price of product.prices) {
		if (
			price.config.type === "usage" &&
			price.config.feature_id === featureId
		) {
			return price.config.usage_tiers;
		}
	}
	return [];
};
