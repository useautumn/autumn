import { expect } from "bun:test";
import { type ApiEntityV0, ApiVersion } from "@autumn/shared";
import { AutumnInt } from "@/external/autumn/autumnCli";

const defaultAutumn = new AutumnInt({ version: ApiVersion.V1_2 });

type ProductState = "active" | "canceled" | "scheduled" | "undefined";

/**
 * Verify an entity has the expected product in the expected state.
 */
export const expectEntityProductCorrect = async ({
	customerId,
	entityId,
	entity: providedEntity,
	productId,
	state,
}: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	productId: string;
	state: ProductState;
}) => {
	const entity = providedEntity
		? providedEntity
		: await defaultAutumn.entities.get(customerId!, entityId!);

	const products = entity.products ?? [];
	const product = products.find((p) => p.id === productId);

	if (state === "undefined") {
		expect(product, `Product ${productId} should not exist`).toBeUndefined();
		return;
	}

	if (!product) {
		throw new Error(
			`Product ${productId} not found on entity but expected state: ${state}`,
		);
	}

	if (state === "active") {
		expect(String(product.status)).toBe("active");
		expect(product.canceled_at == null).toBe(true);
	} else if (state === "canceled") {
		expect(product.canceled_at).toBeDefined();
	} else if (state === "scheduled") {
		expect(String(product.status)).toBe("scheduled");
	}
};

/**
 * Shorthand for checking entity product is active
 */
export const expectEntityProductActive = async (params: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	productId: string;
}) => expectEntityProductCorrect({ ...params, state: "active" });

/**
 * Shorthand for checking entity product is canceled
 */
export const expectEntityProductCanceled = async (params: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	productId: string;
}) => expectEntityProductCorrect({ ...params, state: "canceled" });

/**
 * Shorthand for checking entity product is scheduled
 */
export const expectEntityProductScheduled = async (params: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	productId: string;
}) => expectEntityProductCorrect({ ...params, state: "scheduled" });

/**
 * Shorthand for checking entity product does not exist
 */
export const expectEntityProductNotPresent = async (params: {
	customerId?: string;
	entityId?: string;
	entity?: ApiEntityV0;
	productId: string;
}) => expectEntityProductCorrect({ ...params, state: "undefined" });
