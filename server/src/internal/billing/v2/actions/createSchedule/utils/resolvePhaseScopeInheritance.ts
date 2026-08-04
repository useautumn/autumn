import {
	type Entity,
	type FullProduct,
	isOneOffProduct,
	type MultiAttachProductContext,
} from "@autumn/shared";

// Add-ons and one-offs stack rather than replace, so they key on their own id.
const groupKey = ({ fullProduct }: { fullProduct: FullProduct }) =>
	fullProduct.is_add_on || isOneOffProduct({ product: fullProduct })
		? fullProduct.id
		: (fullProduct.group ?? "");

/** Identifies the slot a plan occupies: its group within one scope. */
export const productScopeKey = ({
	fullProduct,
	internalEntityId,
}: {
	fullProduct: FullProduct;
	internalEntityId?: string;
}) => JSON.stringify([groupKey({ fullProduct }), internalEntityId ?? null]);

const productEntry = ({ fullProduct }: { fullProduct: FullProduct }) =>
	JSON.stringify(["product", fullProduct.id]);

const groupEntry = ({ fullProduct }: { fullProduct: FullProduct }) =>
	JSON.stringify(["group", groupKey({ fullProduct })]);

/**
 * Maps each opening-phase plan to the scope it was attached in, by product and
 * by group. Later phases inherit these — a schedule can't change scope
 * mid-flight, so they never declare their own.
 *
 * A present key with an undefined value means customer-level, which is why
 * lookups below test `has` rather than truthiness.
 */
export const buildOpeningPhaseScopes = ({
	productContexts,
}: {
	productContexts: MultiAttachProductContext[];
}): Map<string, Entity | undefined> => {
	const scopes = new Map<string, Entity | undefined>();

	for (const productContext of productContexts) {
		const entity = productContext.fullCustomer.entity;
		// First plan wins when one product or group spans several scopes.
		for (const key of [
			productEntry(productContext),
			groupEntry(productContext),
		]) {
			if (!scopes.has(key)) scopes.set(key, entity);
		}
	}

	return scopes;
};

export const resolveInheritedScope = ({
	fullProduct,
	openingPhaseScopes,
	fallbackEntity,
}: {
	fullProduct: FullProduct;
	openingPhaseScopes: Map<string, Entity | undefined>;
	fallbackEntity?: Entity;
}): Entity | undefined => {
	// Ungrouped plans share a group key, so an exact plan match wins before it.
	const key = [productEntry({ fullProduct }), groupEntry({ fullProduct })].find(
		(candidate) => openingPhaseScopes.has(candidate),
	);
	if (key === undefined) return fallbackEntity;
	return openingPhaseScopes.get(key);
};
