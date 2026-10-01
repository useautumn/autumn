import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type FullCustomer,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { diffPhaseBalances, type PhaseBalances } from "./diffPhaseBalances";

/** Stored trialing plans are Active with a trial end, the only shape balances read. */
const withTrialingPlansActive = (fullCustomer: FullCustomer): FullCustomer => ({
	...fullCustomer,
	customer_products: fullCustomer.customer_products.map((customerProduct) =>
		customerProduct.status === CusProductStatus.Trialing
			? { ...customerProduct, status: CusProductStatus.Active }
			: customerProduct,
	),
});

const customerBalances = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<PhaseBalances> => {
	const { balances } = await getApiBalances({
		ctx,
		fullCus: withTrialingPlansActive(fullCustomer),
	});
	return balances;
};

/** Each phase's balance changes at its start, against the customer just before it: today's state for the first phase, the previous phase otherwise. */
export const setPlansPhaseBalanceChanges = async ({
	ctx,
	originalFullCustomer,
	phaseCustomers,
}: {
	ctx: AutumnContext;
	originalFullCustomer: FullCustomer;
	phaseCustomers: FullCustomer[];
}): Promise<SetPlansPreviewBalanceChange[][]> => {
	const [originalBalances, ...phaseBalances] = await Promise.all(
		[originalFullCustomer, ...phaseCustomers].map((fullCustomer) =>
			customerBalances({ ctx, fullCustomer }),
		),
	);

	return phaseBalances.map((after, phaseIndex) =>
		diffPhaseBalances({
			before:
				phaseIndex === 0 ? originalBalances : phaseBalances[phaseIndex - 1],
			after,
		}),
	);
};
