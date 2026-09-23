import type { CustomerCreates } from "../../../types/partitionProcessor.js";

export function createCustomerCreates(): CustomerCreates {
	return { tails: new Map() };
}

/** Runs once every earlier create of the same customer has settled; one that failed does not hold the queue. */
export async function runCustomerCreate<Result>({
	customerCreates,
	customerKey,
	run,
}: {
	customerCreates: CustomerCreates;
	customerKey: string;
	run: () => Promise<Result>;
}): Promise<Result> {
	const { tails } = customerCreates;
	const previous = tails.get(customerKey) ?? Promise.resolve();
	const current = previous.then(run);
	const settled = current.then(
		() => undefined,
		() => undefined,
	);
	tails.set(customerKey, settled);
	try {
		return await current;
	} finally {
		if (tails.get(customerKey) === settled) tails.delete(customerKey);
	}
}
