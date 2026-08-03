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

/**
 * Maps each product group in the opening phase to the scope its plan was
 * attached in. Later phases inherit these — a schedule can't change scope
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
		const key = groupKey(productContext);
		// First plan wins when one group spans several scopes.
		if (!scopes.has(key)) {
			scopes.set(key, productContext.fullCustomer.entity);
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
	const key = groupKey({ fullProduct });
	if (!openingPhaseScopes.has(key)) return fallbackEntity;
	return openingPhaseScopes.get(key);
};
