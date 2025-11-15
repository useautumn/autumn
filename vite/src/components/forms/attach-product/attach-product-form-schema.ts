import { z } from "zod/v4";

const ProductFormItemSchema = z.object({
	productId: z.string(),
	quantity: z.number().min(1),
});

const PrepaidOptionSchema = z.object({
	feature_id: z.string(),
	quantity: z.number(),
});

export const AttachProductFormSchema = z.object({
	products: z.array(ProductFormItemSchema),
	prepaidOptions: z.array(PrepaidOptionSchema),
});

export type AttachProductForm = z.infer<typeof AttachProductFormSchema>;
export type ProductFormItem = z.infer<typeof ProductFormItemSchema>;
export type PrepaidOption = z.infer<typeof PrepaidOptionSchema>;
