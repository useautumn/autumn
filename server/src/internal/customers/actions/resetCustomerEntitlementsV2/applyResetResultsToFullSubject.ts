import type {
	FullCusEntWithProduct,
	FullSubject,
	NormalizedFullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import type { RolloverClearingInfo } from "../resetCustomerEntitlements/applyResetResults.js";
import type { ProcessResetResult } from "../resetCustomerEntitlements/processReset.js";

/** Find a customer entitlement on the FullSubject by ID. Uses Object.assign to
 *  preserve the original reference so in-place mutations propagate back. */
const findCustomerEntitlement = ({
	fullSubject,
	customerEntitlementId,
}: {
	fullSubject: FullSubject;
	customerEntitlementId: string;
}): FullCusEntWithProduct | null => {
	for (const customerProduct of fullSubject.customer_products) {
		for (const customerEntitlement of customerProduct.customer_entitlements) {
			if (customerEntitlement.id === customerEntitlementId)
				return Object.assign(customerEntitlement, {
					customer_product: customerProduct,
				});
		}
	}
	for (const customerEntitlement of fullSubject.extra_customer_entitlements ||
		[]) {
		if (customerEntitlement.id === customerEntitlementId)
			return Object.assign(customerEntitlement, { customer_product: null });
	}
	return null;
};

/**
 * Applies computed reset values to in-memory FullSubject for all customer entitlements,
 * and runs rollover max-clearing only for DB-applied (non-skipped) ones.
 * For skipped entries (another request won the race), re-reads rollovers from DB.
 * Returns per-cusEnt clearing info so the cache update can propagate deletes/overwrites.
 */
export const applyResetResultsToFullSubject = async ({
	ctx,
	fullSubject,
	computed,
	skipped,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	computed: Array<{
		customerEntitlementId: string;
		result: ProcessResetResult;
	}>;
	skipped: string[];
}): Promise<Record<string, RolloverClearingInfo>> => {
	const skippedSet = new Set(skipped);
	const clearingMap: Record<string, RolloverClearingInfo> = {};

	const generalCtx = { ...ctx, db: ctx.dbGeneral };

	for (const { customerEntitlementId, result } of computed) {
		const original = findCustomerEntitlement({
			fullSubject,
			customerEntitlementId,
		});
		if (!original) continue;

		const { updates } = result;
		if (updates.balance !== null) original.balance = updates.balance;
		if (updates.additional_balance !== null)
			original.additional_balance = updates.additional_balance;
		original.adjustment = updates.adjustment;
		if (updates.entities !== null) original.entities = updates.entities;
		original.next_reset_at = updates.next_reset_at;

		if (!result.rolloverInsert) continue;

		if (!skippedSet.has(customerEntitlementId)) {
			const { rollovers, deletedIds, overwrites } =
				await RolloverService.clearExcessRollovers({
					ctx: generalCtx,
					newRows: result.rolloverInsert.rows,
					fullCusEnt: original,
				});
			original.rollovers = rollovers;

			if (deletedIds.length > 0 || overwrites.length > 0) {
				clearingMap[customerEntitlementId] = { deletedIds, overwrites };
			}
		} else {
			original.rollovers = await RolloverService.getCurrentRollovers({
				ctx: generalCtx,
				cusEntID: customerEntitlementId,
			});
		}
	}

	return clearingMap;
};

/** Applies the same reset field updates to normalized.customer_entitlements (SubjectBalance entries). */
export const applyResetResultsToNormalized = ({
	normalized,
	computed,
}: {
	normalized: NormalizedFullSubject;
	computed: Array<{
		customerEntitlementId: string;
		result: ProcessResetResult;
	}>;
}) => {
	for (const { customerEntitlementId, result } of computed) {
		const subjectBalance = normalized.customer_entitlements.find(
			(customerEntitlement) => customerEntitlement.id === customerEntitlementId,
		);
		if (!subjectBalance) continue;

		const { updates } = result;
		if (updates.balance !== null) subjectBalance.balance = updates.balance;
		if (updates.additional_balance !== null)
			subjectBalance.additional_balance = updates.additional_balance;
		subjectBalance.adjustment = updates.adjustment;
		if (updates.entities !== null) subjectBalance.entities = updates.entities;
		subjectBalance.next_reset_at = updates.next_reset_at;
	}
};
