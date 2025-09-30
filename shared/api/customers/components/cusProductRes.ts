// import { ProductResV2Schema } from "@api/products/prodResV2/prodResV2.js";
// import { z } from "zod/v4";

// // import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
// // import { ProductItemResponseSchema } from "../../../models/productV2Models/productItemModels/prodItemResponseModels.js";

// const PartialProduct = ProductResV2Schema.pick({
// 	id: true,
// 	name: true,
// 	is_default: true,
// 	is_add_on: true,
// 	version: true,
// 	group: true,
// 	items: true,
// });

// export const CusProductResSchema = z.object({
// 	...PartialProduct.shape,
// 	group: z.string().nullable(),
// 	status: z.enum(["active", "past_due", "expired"]),

// 	canceled_at: z.number().nullable(),
// 	started_at: z.number(),
// 	current_period_start: z.number().nullish(),
// 	current_period_end: z.number().nullish(),
// 	entity_id: z.string().nullish(),

// 	quantity: z.number().optional(),
// });

// // Product related fields
// // id: z.string(),
// // name: z.string().nullable(),
// // is_default: z.boolean(),
// // is_add_on: z.boolean(),
// // version: z.number().nullish(),
// // items: z.array(ProductItemResponseSchema).nullish(),
// // product: {

// // },

// // entity_id: z.string().nullish(),

// // stripe_subscription_ids: z.array(z.string()).nullish(),
