import { InternalError } from "@autumn/shared";
import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels";
import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";

export function findCustomerEntitlementById<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>(params: { cusEnts: T[]; id: string; errorOnNotFound: true }): T;

export function findCustomerEntitlementById<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>(params: { cusEnts: T[]; id: string; errorOnNotFound?: false }): T | undefined;

export function findCustomerEntitlementById<
	T extends FullCustomerEntitlement | FullCusEntWithFullCusProduct,
>({
	cusEnts,
	id,
	errorOnNotFound = false,
}: {
	cusEnts: T[];
	id: string;
	errorOnNotFound?: boolean;
}): T | undefined {
	const cusEnt = cusEnts.find((ce) => ce.id === id);

	if (!cusEnt && errorOnNotFound) {
		throw new InternalError({
			message: `[findCustomerEntitlementById] Customer entitlement not found: ${id}`,
		});
	}

	return cusEnt;
}
