import { sql, type Column, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { RecaseError } from "../errors/base/RecaseError.js";
import { ErrCode } from "../../enums/ErrCode.js";

const CURRENT_CURSOR_VERSION = 0 as const;

export interface CursorCodec<TFields extends { v: number }> {
	readonly fieldsSchema: z.ZodType<TFields>;
	encode(fields: Omit<TFields, "v"> & { v?: TFields["v"] }): string;
	decode(encoded: string): TFields | null;
	predicate(args: {
		cursor: TFields | null;
		columns: readonly Column[];
		values: (cursor: TFields) => readonly unknown[];
		direction?: "asc" | "desc";
	}): SQL;
}

export function defineCursor<TFields extends { v: number }>({
	fieldsSchema,
}: {
	fieldsSchema: z.ZodType<TFields>;
}): CursorCodec<TFields> {
	const encode = (fields: Omit<TFields, "v"> & { v?: TFields["v"] }): string => {
		const full = { v: CURRENT_CURSOR_VERSION, ...fields } as TFields;
		const json = JSON.stringify(full);
		return Buffer.from(json, "utf8").toString("base64url");
	};

	const decode = (encoded: string): TFields | null => {
		if (encoded === "") return null;

		let json: string;
		try {
			json = Buffer.from(encoded, "base64url").toString("utf8");
		} catch (err) {
			throw new RecaseError({
				message: "cursor is not valid base64url",
				code: ErrCode.InvalidCursor,
				statusCode: 400,
				data: { cause: err },
			});
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(json);
		} catch (err) {
			throw new RecaseError({
				message: "cursor payload is not valid JSON",
				code: ErrCode.InvalidCursor,
				statusCode: 400,
				data: { cause: err },
			});
		}

		const result = fieldsSchema.safeParse(parsed);
		if (!result.success) {
			throw new RecaseError({
				message: `cursor shape mismatch: ${result.error.message}`,
				code: ErrCode.InvalidCursor,
				statusCode: 400,
				data: { issues: result.error.issues },
			});
		}
		return result.data;
	};

	const predicate = ({
		cursor,
		columns,
		values,
		direction = "desc",
	}: {
		cursor: TFields | null;
		columns: readonly Column[];
		values: (cursor: TFields) => readonly unknown[];
		direction?: "asc" | "desc";
	}): SQL => {
		if (!cursor) return sql``;
		if (columns.length === 0) {
			throw new RecaseError({
				message: "cursor predicate: columns must be non-empty",
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		const valueList = values(cursor);
		if (valueList.length !== columns.length) {
			throw new RecaseError({
				message: `cursor predicate: expected ${columns.length} values, got ${valueList.length}`,
				code: ErrCode.InternalError,
				statusCode: 500,
			});
		}

		const op = direction === "desc" ? sql.raw("<") : sql.raw(">");
		const columnTuple = sql.join(
			columns.map((c) => sql`${c}`),
			sql`, `,
		);
		const valueTuple = sql.join(
			valueList.map((v) => sql`${v}`),
			sql`, `,
		);

		return sql`AND (${columnTuple}) ${op} (${valueTuple})`;
	};

	return { fieldsSchema, encode, decode, predicate };
}

const StandardCursorFieldsSchema = z.object({
	v: z.literal(CURRENT_CURSOR_VERSION),
	id: z.string().min(1),
	t: z.number().int().nonnegative(),
});

export type StandardCursorFields = z.infer<typeof StandardCursorFieldsSchema>;

export const StandardCursor = defineCursor({
	fieldsSchema: StandardCursorFieldsSchema,
});

export const PaginationDefaults = {
	DefaultLimit: 50,
	MaxLimit: 1000,
	SchemaHardCeiling: 5000,
} as const;

export const CursorRequestFieldSchema = z
	.string()
	.default("")
	.describe(
		"Opaque pagination cursor. Empty string (default) requests the first page; use next_cursor from a prior response for subsequent pages.",
	);

export const createCursorLimitSchema = ({
	defaultLimit = PaginationDefaults.DefaultLimit,
	maxLimit = PaginationDefaults.SchemaHardCeiling,
}: {
	defaultLimit?: number;
	maxLimit?: number;
} = {}) =>
	z.coerce
		.number()
		.int()
		.min(1)
		.max(maxLimit)
		.default(defaultLimit)
		.describe(
			`Number of items to return. Default ${defaultLimit}, hard ceiling ${maxLimit}.`,
		);

export const createCursorPaginatedResponseSchema = <T extends z.ZodType>(
	itemSchema: T,
) =>
	z.object({
		list: z.array(itemSchema).describe("Items for current page."),
		next_cursor: z
			.string()
			.nullable()
			.describe(
				"Opaque cursor for the next page. Null when there are no more results.",
			),
	});

export type CursorPaginatedResponse<T> = {
	list: T[];
	next_cursor: string | null;
};
