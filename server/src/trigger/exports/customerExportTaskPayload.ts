import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";

export const RunCustomerExportPayloadSchema = z.object({
	exportId: z.string(),
	orgId: z.string(),
	env: z.enum(AppEnv),
});

export type RunCustomerExportPayload = z.infer<
	typeof RunCustomerExportPayloadSchema
>;
