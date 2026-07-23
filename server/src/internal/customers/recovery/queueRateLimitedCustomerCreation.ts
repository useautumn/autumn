import {
	CreateCustomerParamsV0Schema,
	CreateCustomerParamsV1Schema,
	CustomerDataSchema,
} from "@autumn/shared";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { queueFailedCustomerCreation } from "./queueFailedCustomerCreation.js";

const GET_OR_CREATE_PATH = "/v1/customers.get_or_create";
const LEGACY_CREATE_PATH = "/v1/customers";

const getWithAutumnIdFromQuery = ({ c }: { c: Context<HonoEnv> }) => {
	const value = c.req.query("with_autumn_id");
	return value === "true" || value === "1";
};

export const queueRateLimitedCustomerCreation = async ({
	c,
}: {
	c: Context<HonoEnv>;
}): Promise<boolean> => {
	const path = c.req.path;
	if (c.req.method !== "POST") return false;
	if (path !== GET_OR_CREATE_PATH && path !== LEGACY_CREATE_PATH) return false;

	const ctx = c.get("ctx");

	try {
		const body = await c.req.raw.clone().json();
		if (path === GET_OR_CREATE_PATH) {
			const parsed = CreateCustomerParamsV1Schema.safeParse(body);
			if (!parsed.success) return false;
			if (!parsed.data.customer_id && !parsed.data.email) return false;

			return await queueFailedCustomerCreation({
				ctx,
				params: {
					customer_id: parsed.data.customer_id,
					customer_data: CustomerDataSchema.parse(parsed.data),
					entity_id: parsed.data.entity_id,
					entity_data: parsed.data.entity_data,
				},
				source: "rateLimit:customers.get_or_create",
				withAutumnId: parsed.data.with_autumn_id,
				failureStage: "lookup",
			});
		}

		const parsed = CreateCustomerParamsV0Schema.safeParse(body);
		if (!parsed.success) return false;
		if (!parsed.data.id && !parsed.data.email) return false;

		return await queueFailedCustomerCreation({
			ctx,
			params: {
				customer_id: parsed.data.id,
				customer_data: CustomerDataSchema.parse(parsed.data),
				entity_id: parsed.data.entity_id,
				entity_data: parsed.data.entity_data,
			},
			source: "rateLimit:customers",
			withAutumnId: getWithAutumnIdFromQuery({ c }),
			failureStage: "lookup",
		});
	} catch (error) {
		ctx.logger.error(
			"[customerCreationRecovery] Failed to capture rate-limited request",
			{ error },
		);
		return false;
	}
};
