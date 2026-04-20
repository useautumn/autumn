import { type SubjectBalance, SubjectBalanceSchema } from "@autumn/shared";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

/**
 * Repair a `SubjectBalance` read from Redis so Upstash cjson null-drops and
 * empty-collection swaps are reversed before the value reaches downstream
 * Zod validators (e.g. the webhook / API response schemas).
 */
export const sanitizeCachedSubjectBalance = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): SubjectBalance =>
	normalizeFromSchema<SubjectBalance>({
		schema: SubjectBalanceSchema,
		data: subjectBalance,
	});
