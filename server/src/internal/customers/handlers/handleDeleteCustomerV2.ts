import { AffectedResource, CustomerNotFoundError } from "@autumn/shared";
import chalk from "chalk";
import { z } from "zod/v4";
import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { CusService } from "../CusService.js";
import { deleteCachedApiCustomer } from "../cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";

const DeleteCustomerQuerySchema = z.object({
	delete_in_stripe: z.boolean().optional().default(false),
});

export const handleDeleteCustomerV2 = createRoute({
	query: DeleteCustomerQuerySchema,
	resource: AffectedResource.Customer,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org, env } = ctx;
		const { customer_id } = c.req.param();
		const { delete_in_stripe } = c.req.valid("query");

		const customer = await CusService.get({
			db,
			idOrInternalId: customer_id,
			orgId: org.id,
			env,
		});

		if (!customer) {
			throw new CustomerNotFoundError({ customerId: customer_id });
		}

		const response = {
			customer,
			success: true,
		};

		try {
			if (customer.processor?.id && delete_in_stripe) {
				await deleteStripeCustomer({
					org,
					env,
					stripeId: customer.processor.id,
				});
			}
		} catch (error: any) {
			console.log(
				`Couldn't delete ${chalk.yellow("stripe customer")} ${
					customer.processor.id
				}`,
				error?.message || error,
			);

			response.success = false;
		}

		await CusService.deleteByInternalId({
			db,
			internalId: customer.internal_id,
			orgId: org.id,
			env,
		});

		// Delete customer and all entity caches atomically
		await deleteCachedApiCustomer({
			customerId: customer.id ?? "",
			orgId: org.id,
			env,
		});

		return c.json(response);
	},
});
