import type { FullSubject } from "@autumn/shared";
import type { RolloverUpdate } from "../types/rolloverUpdate.js";

const applyRolloverUpdate = ({
	fullSubjectCustomerEntitlements,
	rolloverUpdates,
}: {
	fullSubjectCustomerEntitlements: FullSubject["extra_customer_entitlements"];
	rolloverUpdates: Record<string, RolloverUpdate>;
}) => {
	for (const customerEntitlement of fullSubjectCustomerEntitlements) {
		if (!customerEntitlement.rollovers) continue;

		for (const rollover of customerEntitlement.rollovers) {
			const update = rolloverUpdates[rollover.id];
			if (!update) continue;

			rollover.balance = update.balance;
			rollover.usage = update.usage;
			rollover.entities = update.entities;
		}
	}
};

export const applyRolloverUpdatesToFullSubject = ({
	fullSubject,
	rolloverUpdates,
}: {
	fullSubject: FullSubject;
	rolloverUpdates: Record<string, RolloverUpdate>;
}) => {
	if (Object.keys(rolloverUpdates).length === 0) return;

	for (const customerProduct of fullSubject.customer_products) {
		applyRolloverUpdate({
			fullSubjectCustomerEntitlements: customerProduct.customer_entitlements,
			rolloverUpdates,
		});
	}

	applyRolloverUpdate({
		fullSubjectCustomerEntitlements: fullSubject.extra_customer_entitlements,
		rolloverUpdates,
	});
};
