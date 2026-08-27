import { prices } from "@autumn/shared";
import { eq } from "drizzle-orm";

/** Catalog cannot borrow a custom row. Custom can borrow catalog. */
export const composeReusableCustomScope = ({
	targetIsCustom,
}: {
	targetIsCustom: boolean;
}) => (targetIsCustom ? undefined : eq(prices.is_custom, false));
