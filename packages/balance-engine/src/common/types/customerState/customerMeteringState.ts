import { z } from "zod/v4";
import { meteringIdentitySchema } from "../meteringIdentity.js";
import { nonEmptyStringSchema } from "../schemaUtils.js";
import { leanCustomerEntitlementSchema } from "./leanCustomerEntitlement.js";

// One feature's ordered entitlement rows: the pots a deduction drains, in order.
const featureCustomerEntitlementsSchema = z
	.array(leanCustomerEntitlementSchema)
	.min(1)
	.check((ctx) => {
		const customerEntitlementIds = new Set<string>();
		for (const [index, customerEntitlement] of ctx.value.entries()) {
			if (customerEntitlementIds.has(customerEntitlement.id)) {
				ctx.issues.push({
					code: "custom",
					message: `Duplicate customer entitlement id: ${customerEntitlement.id}`,
					path: [index, "id"],
					input: ctx.value,
				});
			}
			customerEntitlementIds.add(customerEntitlement.id);
		}
	});

// One customer's complete metering world: current balances plus the revision
// counter that orders every applied outcome. Receipts live outside this state.
export const customerMeteringStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		identity: meteringIdentitySchema,
		revision: z.number().int().nonnegative(),
		customerEntitlementsByFeatureId: z.record(
			nonEmptyStringSchema,
			featureCustomerEntitlementsSchema,
		),
	})
	.strict();

export type CustomerMeteringState = z.infer<typeof customerMeteringStateSchema>;
