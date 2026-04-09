import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";

export const CustomerBlockEntrySchema = z.object({
	updatedAt: z.string().optional(),
	updatedBy: z.string().optional(),
});

export const CustomerBlockEnvEntriesSchema = z.object({
	[AppEnv.Sandbox]: z.record(z.string(), CustomerBlockEntrySchema).default({}),
	[AppEnv.Live]: z.record(z.string(), CustomerBlockEntrySchema).default({}),
});

export const CustomerBlockConfigSchema = z.object({
	orgs: z.record(z.string(), CustomerBlockEnvEntriesSchema).default({}),
});

export type CustomerBlockEntry = z.infer<typeof CustomerBlockEntrySchema>;
export type CustomerBlockEnvEntries = z.infer<
	typeof CustomerBlockEnvEntriesSchema
>;
export type CustomerBlockConfig = z.infer<typeof CustomerBlockConfigSchema>;
