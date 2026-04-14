import {
	type FullCustomer,
	type FullSubject,
	InternalError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepareDeductionOptions } from "../deduction/prepareDeductionOptions.js";
import type { DeductionOptions } from "../types/deductionTypes.js";
import type { DeductionUpdate } from "../types/deductionUpdate.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";
import type { MutationLogItem } from "../types/mutationLogItem.js";
import type { RolloverUpdate } from "../types/rolloverUpdate.js";
import { prepareFeatureDeductionV2 } from "./prepareFeatureDeductionV2.js";

export const executeRedisDeductionV2 = async ({
	ctx,
	fullSubject,
	entityId,
	deductions,
	deductionOptions = {},
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	entityId?: string;
	deductions: FeatureDeduction[];
	deductionOptions?: DeductionOptions;
}): Promise<{
	oldFullSubject: FullSubject;
	fullSubject: FullSubject;
	updates: Record<string, DeductionUpdate>;
	rolloverUpdates: Record<string, RolloverUpdate>;
	mutationLogs: MutationLogItem[];
}> => {
	const _oldFullSubject = structuredClone(fullSubject);
	const resolvedOptions = prepareDeductionOptions({
		options: deductionOptions,
		fullCustomer: fullSubject.customer as unknown as FullCustomer,
		deductions,
	});
	const preparedDeductions = deductions.map((deduction) =>
		prepareFeatureDeductionV2({
			ctx,
			fullSubject,
			deduction,
			options: resolvedOptions,
		}),
	);

	throw new InternalError({
		message: "FullSubject Redis deduction is not implemented",
		code: "full_subject_redis_deduction_not_implemented",
		data: {
			entityId: entityId ?? null,
			deductionsCount: deductions.length,
			preparedDeductionsCount: preparedDeductions.length,
			subjectType: _oldFullSubject.subjectType,
		},
	});
};
