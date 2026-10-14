import { Scopes } from "@autumn/shared";
import { createAdvanceTestClockRoute } from "@/internal/customers/handlers/handleAdvanceTestClock";

export const handleLegacyAdvanceTestClock = createAdvanceTestClockRoute({
	scopes: { ANY: [Scopes.Customers.Write, Scopes.Billing.Write] },
});
