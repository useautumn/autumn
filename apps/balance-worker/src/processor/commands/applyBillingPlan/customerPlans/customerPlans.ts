import type { CustomerPlans } from "../../../types/partitionProcessor.js";

export function createCustomerPlans(): CustomerPlans {
	return { tails: new Map() };
}

/** Runs once every earlier plan of the same customer has settled; one that failed does not hold the queue. */
export async function runCustomerPlan<Result>({
	customerPlans,
	customerKey,
	run,
}: {
	customerPlans: CustomerPlans;
	customerKey: string;
	run: () => Promise<Result>;
}): Promise<Result> {
	const { tails } = customerPlans;
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
