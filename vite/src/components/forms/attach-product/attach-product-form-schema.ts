import { z } from "zod/v4";

const ProductFormItemSchema = z.object({
	productId: z.string(),
	quantity: z.number().min(1),
});

export const AttachProductFormSchema = z.object({
	products: z.array(ProductFormItemSchema),
	prepaidOptions: z.record(z.string(), z.number()),
});

export type AttachProductForm = z.infer<typeof AttachProductFormSchema>;
export type ProductFormItem = z.infer<typeof ProductFormItemSchema>;
