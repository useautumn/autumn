import { isDeepStrictEqual } from "node:util";
import {
	type BalanceAllocationControl,
	BalanceAllocationControlsSchema,
	type BalanceAllocations,
	CustomerNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { computeAllocationUpdate } from "./computeAllocationUpdate.js";
import {
	withAllocationLock,
	writeAllocations,
} from "./repos/allocationStore.js";
import { setAllocationCounters } from "./repos/setAllocationCounters.js";

const computeReplacement = async ({
	ctx,
	tx,
	fullSubject,
	controls,
	allocations,
}: {
	ctx: AutumnContext;
	tx: DrizzleCli;
	fullSubject: FullSubject;
	controls: BalanceAllocationControl[];
	allocations: BalanceAllocations | null;
}) => {
	const next: BalanceAllocations = {};
	const counters: Parameters<typeof setAllocationCounters>[0]["counters"] = [];
	for (const control of controls) {
		const update = await computeAllocationUpdate({
			ctx,
			tx,
			fullSubject,
			allocations,
			params: control,
		});
		if (Object.keys(update.allocation.amounts).length > 0)
			next[update.internalFeatureId] = update.allocation;
		counters.push(...update.counters);
	}
	return { next, counters };
};

const allocationShares = (allocations: BalanceAllocations | null) =>
	Object.fromEntries(
		Object.entries(allocations ?? {})
			.filter(([, allocation]) => Object.keys(allocation.amounts).length > 0)
			.map(([id, allocation]) => [
				id,
				{ amounts: allocation.amounts, scale: allocation.scale },
			]),
	);

export const prepareBalanceAllocationReplacement = async ({
	ctx,
	customerId,
	controls,
}: {
	ctx: AutumnContext;
	customerId: string;
	controls: BalanceAllocationControl[] | undefined;
}): Promise<FullSubject | undefined> => {
	if (controls === undefined) return undefined;
	BalanceAllocationControlsSchema.parse(controls);
	await invalidateCachedFullSubject({
		ctx,
		customerId,
		source: "replaceBalanceAllocations",
		flushBalances: true,
	});
	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		readFrom: "primary",
	});
	if (!fullSubject) throw new CustomerNotFoundError({ customerId });
	await withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: ({ tx, allocations }) =>
			computeReplacement({ ctx, tx, fullSubject, controls, allocations }),
	});
	return fullSubject;
};

export const replaceBalanceAllocations = async ({
	ctx,
	fullSubject,
	controls,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	controls: BalanceAllocationControl[];
}): Promise<boolean> =>
	withAllocationLock({
		ctx,
		internalCustomerId: fullSubject.customer.internal_id,
		fn: async ({ tx, allocations }) => {
			const { next, counters } = await computeReplacement({
				ctx,
				tx,
				fullSubject,
				controls,
				allocations,
			});
			await setAllocationCounters({ db: tx, counters });
			await writeAllocations({
				ctx,
				tx,
				internalCustomerId: fullSubject.customer.internal_id,
				allocations: next,
			});
			return !isDeepStrictEqual(
				allocationShares(allocations),
				allocationShares(next),
			);
		},
	});
