import type { CatalogRow } from "@autumn/balance-engine";
import { z } from "zod/v4";
import { sentAs } from "./sentAs.js";

const rowShape = z.union([
	z.looseObject({
		table: z.enum(["products", "features"]),
		row: z.looseObject({ internal_id: z.string().min(1) }),
	}),
	z.looseObject({
		table: z.enum(["entitlements", "prices", "planLicenses", "freeTrials"]),
		row: z.looseObject({ id: z.string().min(1) }),
	}),
]);

const catalogBodySchema = z.object({
	rows: z.array(sentAs<CatalogRow>(rowShape)),
	read_at: z.number().int().nonnegative(),
});

export const catalogBodyToSharedRows = ({
	body,
}: {
	body: unknown;
}): { rows: CatalogRow[]; readAt: number } => {
	const parsed = catalogBodySchema.parse(body);
	return { rows: parsed.rows, readAt: parsed.read_at };
};
