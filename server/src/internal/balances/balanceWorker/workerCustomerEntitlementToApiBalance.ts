import type { WorkerCustomerEntitlement } from "@autumn/balance-engine";
import {
	type ApiBalanceV1,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToFullCustomer,
	getApiBalance,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { BalanceWorkerUnsupportedError } from "./balanceWorkerErrors.js";

const findFullCustomerEntitlement = ({
	fullSubject,
	id,
}: {
	fullSubject: FullSubject;
	id: string;
}): FullCusEntWithFullCusProduct | undefined => {
	for (const customerProduct of fullSubject.customer_products) {
		const match = customerProduct.customer_entitlements.find(
			(entitlement) => entitlement.id === id,
		);
		if (match) return { ...match, customer_product: customerProduct };
	}
	const loose = [
		...fullSubject.extra_customer_entitlements,
		...(fullSubject.pooled_customer_entitlements ?? []),
	].find((entitlement) => entitlement.id === id);
	return loose ? { ...loose, customer_product: null } : undefined;
};

/** The worker returns the row after its decision; the server's own FullSubject supplies everything the API balance derives from catalog. */
export function workerCustomerEntitlementToApiBalance({
	ctx,
	fullSubject,
	customerEntitlement,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	customerEntitlement: WorkerCustomerEntitlement;
}): ApiBalanceV1 {
	const full = findFullCustomerEntitlement({
		fullSubject,
		id: customerEntitlement.id,
	});
	if (!full)
		throw new BalanceWorkerUnsupportedError({
			reason: "customer_entitlement_not_found",
		});
	const { data } = getApiBalance({
		ctx: { ...ctx, expand: [] },
		fullCus: fullSubjectToFullCustomer({ fullSubject }),
		cusEnts: [{ ...full, balance: customerEntitlement.balance }],
		feature: full.entitlement.feature,
	});
	return data;
}
