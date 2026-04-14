import type { FullSubject } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

const applyUpdate = ({
	customerEntitlement,
	update,
}: {
	customerEntitlement: FullSubject["extra_customer_entitlements"][number];
	update: DeductionUpdate;
}) => ({
	...customerEntitlement,
	balance: update.balance,
	adjustment: update.adjustment,
	entities: update.entities,
});

export const applyDeductionUpdateToFullSubject = ({
	fullSubject,
	customerEntitlementId,
	update,
}: {
	fullSubject: FullSubject;
	customerEntitlementId: string;
	update: DeductionUpdate;
}) => {
	for (const customerProduct of fullSubject.customer_products) {
		for (
			let index = 0;
			index < customerProduct.customer_entitlements.length;
			index++
		) {
			const customerEntitlement = customerProduct.customer_entitlements[index];
			if (customerEntitlement.id !== customerEntitlementId) continue;

			customerProduct.customer_entitlements[index] = applyUpdate({
				customerEntitlement,
				update,
			});
			return;
		}
	}

	for (
		let index = 0;
		index < fullSubject.extra_customer_entitlements.length;
		index++
	) {
		const customerEntitlement = fullSubject.extra_customer_entitlements[index];
		if (customerEntitlement.id !== customerEntitlementId) continue;

		fullSubject.extra_customer_entitlements[index] = applyUpdate({
			customerEntitlement,
			update,
		});
		return;
	}
};
