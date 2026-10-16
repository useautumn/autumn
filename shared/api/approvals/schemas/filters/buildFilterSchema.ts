import { z } from "zod/v4";

/** A filter over a shape's fields, composable with `$and` / `$or`. */
export type FilterOf<Shape extends z.ZodRawShape> = z.infer<
	z.ZodObject<Shape>
> & {
	$and?: FilterOf<Shape>[];
	$or?: FilterOf<Shape>[];
};

/**
 * `loose` keeps keys the shape doesn't know; the API envelope uses it so a stored
 * rule from another area reads back unchanged. Validation always uses the strict form.
 */
export const buildFilterSchema = <Shape extends z.ZodRawShape>({
	shape,
	loose = false,
}: {
	shape: Shape;
	loose?: boolean;
}) => {
	const schema: z.ZodType<FilterOf<Shape>> = z.lazy(() => {
		const fields = {
			...shape,
			$and: z.array(schema).min(1).optional(),
			$or: z.array(schema).min(1).optional(),
		};
		return loose ? z.looseObject(fields) : z.object(fields);
	}) as z.ZodType<FilterOf<Shape>>;
	return schema;
};
