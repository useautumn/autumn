import { z } from "zod/v4";

const PROTECTED_BODY_FIELD_NAMES = ["customerId", "customerData"] as const;

const getProtectedShape = ({
	schema,
}: {
	schema: z.ZodObject<z.ZodRawShape>;
}) => {
	const omitShape: Partial<
		Record<(typeof PROTECTED_BODY_FIELD_NAMES)[number], true>
	> = {};

	for (const fieldName of PROTECTED_BODY_FIELD_NAMES) {
		if (fieldName in schema.shape) {
			omitShape[fieldName] = true;
		}
	}

	return omitShape;
};

export const omitProtectedBodyFields = ({
	schema,
}: {
	schema?: z.ZodTypeAny;
}) => {
	if (!(schema instanceof z.ZodObject)) {
		return schema;
	}

	const omitShape = getProtectedShape({ schema });

	if (Object.keys(omitShape).length === 0) {
		return schema;
	}

	return schema.omit(omitShape);
};
