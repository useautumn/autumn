import type { AppEnv } from "@autumn/shared";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export interface HandleCustomerCreatedData {
	req: Partial<ExtendedRequest>;
	orgId: string;
	env: AppEnv;
	internalCustomerId: string;
}
