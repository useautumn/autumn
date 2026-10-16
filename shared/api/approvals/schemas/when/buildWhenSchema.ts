import { z } from "zod/v4";

/** A `when` filter over a shape's fields, composable with `$and` / `$or`. */
export type WhenOf<Shape extends z.ZodRawShape> = z.infer<
	z.ZodObject<Shape>
> & {
	$and?: WhenOf<Shape>[];
	$or?: WhenOf<Shape>[];
};

export const buildWhenSchema = <Shape extends z.ZodRawShape>({
	shape,
}: {
	shape: Shape;
}) => {
	const schema: z.ZodType<WhenOf<Shape>> = z.lazy(() =>
		z.object({
			...shape,
			$and: z.array(schema).min(1).optional(),
			$or: z.array(schema).min(1).optional(),
		}),
	) as z.ZodType<WhenOf<Shape>>;
	return schema;
};
