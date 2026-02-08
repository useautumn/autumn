import { checkoutContract } from "@autumn/shared";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";

const link = new OpenAPILink(checkoutContract, {
	url: import.meta.env.VITE_API_URL || "http://localhost:8080",
});

export const checkoutApi: JsonifiedClient<
	ContractRouterClient<typeof checkoutContract>
> = createORPCClient(link);

// Usage:
// const { preview } = await checkoutApi.getCheckout({ checkout_id: "co_xxx" });
// const result = await checkoutApi.confirmCheckout({ checkout_id: "co_xxx" });
