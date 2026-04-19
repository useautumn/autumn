import type { FullSubject } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

const getUpdatedReplaceables = ({
	replaceables,
	update,
}: {
	replaceables: FullSubject["extra_customer_entitlements"][number]["replaceables"];
	update: DeductionUpdate;
}) => {
	let nextReplaceables = replaceables ?? [];

	if (update.newReplaceables) {
		nextReplaceables = [
			...nextReplaceables,
			...update.newReplaceables.map((replaceable) => ({
				...replaceable,
				delete_next_cycle: replaceable.delete_next_cycle ?? true,
				from_entity_id: replaceable.from_entity_id ?? null,
			})),
		];
	}

	if (update.deletedReplaceables) {
		const deletedReplaceableIds = new Set(
			update.deletedReplaceables.map((replaceable) => replaceable.id),
		);
		nextReplaceables = nextReplaceables.filter(
			(replaceable) => !deletedReplaceableIds.has(replaceable.id),
		);
	}

	return nextReplaceables;
};

const applyUpdate = ({
	customerEntitlement,
	update,
}: {
	customerEntitlement: FullSubject["extra_customer_entitlements"][number];
	update: DeductionUpdate;
}) => ({
	...customerEntitlement,
	balance: update.balance,
	additional_balance: update.additional_balance,
	adjustment: update.adjustment,
	entities: update.entities,
	replaceables: getUpdatedReplaceables({
		replaceables: customerEntitlement.replaceables,
		update,
	}),
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
