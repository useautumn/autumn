import { prices } from "@autumn/shared";
import { eq } from "drizzle-orm";

export const composeReusableCustomScope = ({
	targetIsCustom,
}: {
	targetIsCustom: boolean;
}) => (targetIsCustom ? undefined : eq(prices.is_custom, false));
