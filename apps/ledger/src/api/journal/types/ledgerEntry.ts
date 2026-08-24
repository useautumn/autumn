import { AppEnv } from "@autumn/shared";
import { z } from "zod/v4";
import {
	BALANCE_DEDUCTED,
	BalanceDeductedFactsSchema,
} from "../facts/balanceDeducted.js";
import { RowChangeSchema } from "./rowChange.js";

export const LEDGER_ENTRY_SCHEMA_VERSION = 1;

// Who, where, when, in what order, on whose behalf. Additive only: new fields
// are optional, existing ones are never renamed, removed or retyped.
const LedgerEntryEnvelopeSchema = z.object({
	schema_version: z.literal(LEDGER_ENTRY_SCHEMA_VERSION),
	id: z.string().min(1),
	org_id: z.string().min(1),
	env: z.enum(AppEnv),
	customer_id: z.string().min(1),
	internal_customer_id: z.string().min(1),
	// The partition this entry is produced to.
	shard_id: z.number().int().nonnegative(),
	// Per customer, gapless: apply iff version = projected + 1.
	version: z.number().int().positive(),
	// The command's clock — what the fold used.
	at: z.number().int(),
	// Wall clock at append; lag and debugging only, never a decision.
	recorded_at: z.number().int(),
	command: z.object({
		id: z.string().min(1),
		kind: z.string().min(1),
		api_version: z.string().min(1).optional(),
		correlation_id: z.string().min(1).optional(),
	}),
	changes: z.array(RowChangeSchema),
});

// `changes` rebuilds a subject without knowing the operation; `facts`, typed by
// `kind`, serves consumers that never parse rows. New kinds join this union.
export const LedgerEntrySchema = z.discriminatedUnion("kind", [
	LedgerEntryEnvelopeSchema.extend({
		kind: z.literal(BALANCE_DEDUCTED),
		facts: BalanceDeductedFactsSchema,
	}),
]);

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type EntryKind = LedgerEntry["kind"];
