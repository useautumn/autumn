import { type SubjectBalance, SubjectBalanceSchema } from "@autumn/shared";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

export const sanitizeCachedSubjectBalance = ({
	subjectBalance,
}: {
	subjectBalance: SubjectBalance;
}): SubjectBalance =>
	normalizeFromSchema<SubjectBalance>({
		schema: SubjectBalanceSchema,
		data: subjectBalance,
	});
