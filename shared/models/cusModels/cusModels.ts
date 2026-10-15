import { z } from "zod/v4";
import { CustomerIdSchema } from "../../api/common/customerId.js";
import { AppEnv } from "../genModels/genEnums.js";
import { ExternalProcessorsSchema } from "../genModels/processorSchemas.js";
import { BalanceAllocationsSchema } from "./balanceAllocations/balanceAllocationModels.js";
import { DbBillingControlsSchema } from "./billingControls/customerBillingControls.js";

export const CustomerSchema = z.object({
	id: z.string().nullish(), // given by user
	name: z.string().nullish(),
	email: z.string().nullish(),
	fingerprint: z.string().nullish(),

	// Internal
	internal_id: z.string(),
	org_id: z.string(),
	created_at: z.number(),
	env: z.enum(AppEnv),
	processor: z.any(),
	processors: ExternalProcessorsSchema.nullish(),
	metadata: z.record(z.any(), z.any()).nullish().default({}),
	send_email_receipts: z.boolean().default(false),
	currency: z.string().nullish(),
	...DbBillingControlsSchema.shape,
	balance_allocations: BalanceAllocationsSchema.nullish(),
	config: z
		.object({
			disable_pooled_balance: z.boolean().optional(),
			disable_overage_billing: z.boolean().optional(),
		})
		.nullish(),
	/** Per Atom, per journal (writer id), the highest seq of its tracks the balance worker has applied. */
	atom_seqs: z.record(z.string(), z.record(z.string(), z.number())).nullish(),
});

export type Customer = z.infer<typeof CustomerSchema>;

export const CreateCustomerSchema = z.object({
	id: CustomerIdSchema.nullish(),
	name: z.string().nullish(),
	email: z
		.string()
		.email({ message: "not a valid email address" })
		.or(z.literal(""))
		.nullish(),
	fingerprint: z.string().nullish(),
	metadata: z.record(z.any(), z.any()).default({}).nullish(),
	stripe_id: z.string().nullish(),
	processors: ExternalProcessorsSchema.nullish(),
	send_email_receipts: z.boolean().default(false),
	currency: z.string().nullish(),
});

export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
