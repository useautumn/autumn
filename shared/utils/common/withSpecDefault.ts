import { JSON_SCHEMA_REGISTRY } from "@orpc/zod/zod4";
import type { z } from "zod/v4";

export const withSpecDefault = <T extends z.ZodType>({
	schema,
	defaultValue,
	description,
}: {
	schema: T;
	defaultValue: z.input<T>;
	description: string;
}): T => {
	JSON_SCHEMA_REGISTRY.add(schema, { description, default: defaultValue });
	return schema;
};
