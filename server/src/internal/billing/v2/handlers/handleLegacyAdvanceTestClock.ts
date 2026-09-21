import { Scopes } from "@autumn/shared";
import { createAdvanceTestClockRoute } from "@/internal/customers/handlers/handleAdvanceTestClock";

/** Keys minted before the move to customers.advance_test_clock only hold billing:write. */
export const handleLegacyAdvanceTestClock = createAdvanceTestClockRoute({
	scopes: { ANY: [Scopes.Customers.Write, Scopes.Billing.Write] },
});
