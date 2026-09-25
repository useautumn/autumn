import {
	type ApplyBillingPlanRequest,
	applyBillingPlanRequestSchema,
} from "./commands/applyBillingPlan/types/applyBillingPlanRequest.js";
import {
	type CheckCommand,
	checkCommandSchema,
} from "./commands/check/types/checkCommand.js";
import {
	type ConfirmExpiredLockCommand,
	confirmExpiredLockCommandSchema,
} from "./commands/confirmExpiredLock/types/confirmExpiredLockCommand.js";
import {
	type DeleteBalanceCommand,
	deleteBalanceCommandSchema,
} from "./commands/deleteBalance/types/deleteBalanceCommand.js";
import {
	type EvictCommand,
	evictCommandSchema,
} from "./commands/evict/types/evictCommand.js";
import {
	type FinalizeCommand,
	finalizeCommandSchema,
} from "./commands/finalize/types/finalizeCommand.js";
import {
	type FlushCommand,
	flushCommandSchema,
} from "./commands/flush/types/flushCommand.js";
import {
	type InitializeCommand,
	initializeCommandSchema,
} from "./commands/initialize/types/initializeCommand.js";
import {
	type InitializeRequest,
	initializeRequestSchema,
} from "./commands/initialize/types/initializeRequest.js";
import {
	type ReadSubjectStateCommand,
	readSubjectStateCommandSchema,
} from "./commands/readSubjectState/types/readSubjectStateCommand.js";
import {
	type RecalculateBalanceCommand,
	recalculateBalanceCommandSchema,
} from "./commands/recalculateBalance/types/recalculateBalanceCommand.js";
import {
	type ResetCommand,
	resetCommandSchema,
} from "./commands/reset/types/resetCommand.js";
import {
	type TrackCommand,
	trackCommandSchema,
} from "./commands/track/types/trackCommand.js";
import {
	type UpdateBalanceCommand,
	updateBalanceCommandSchema,
} from "./commands/updateBalance/types/updateBalanceCommand.js";
import { type Catalog, catalogSchema } from "./models/catalog/catalog.js";
import {
	type CatalogRow,
	catalogRowSchema,
} from "./models/catalog/catalogRow.js";
import {
	type MeteringIdentity,
	meteringIdentitySchema,
} from "./models/identity/meteringIdentity.js";
import {
	type MutationRecord,
	mutationRecordSchema,
} from "./models/mutation/mutationRecord.js";
import {
	type SubjectStateMutation,
	subjectStateMutationSchema,
} from "./models/mutation/subjectStateMutation.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "./models/subject/rows/workerCustomerEntitlement.js";
import {
	type WorkerLock,
	workerLockSchema,
} from "./models/subject/rows/workerLock.js";
import {
	type SubjectState,
	subjectStateSchema,
} from "./models/subject/subjectState.js";

export const parseTrackCommand = ({
	input,
}: {
	input: unknown;
}): TrackCommand => trackCommandSchema.parse(input);

export const parseCheckCommand = ({
	input,
}: {
	input: unknown;
}): CheckCommand => checkCommandSchema.parse(input);

export const parseReadSubjectStateCommand = ({
	input,
}: {
	input: unknown;
}): ReadSubjectStateCommand => readSubjectStateCommandSchema.parse(input);

export const parseFlushCommand = ({
	input,
}: {
	input: unknown;
}): FlushCommand => flushCommandSchema.parse(input);

export const parseEvictCommand = ({
	input,
}: {
	input: unknown;
}): EvictCommand => evictCommandSchema.parse(input);

export const parseConfirmExpiredLockCommand = ({
	input,
}: {
	input: unknown;
}): ConfirmExpiredLockCommand => confirmExpiredLockCommandSchema.parse(input);

export const parseResetCommand = ({
	input,
}: {
	input: unknown;
}): ResetCommand => resetCommandSchema.parse(input);

export const parseUpdateBalanceCommand = ({
	input,
}: {
	input: unknown;
}): UpdateBalanceCommand => updateBalanceCommandSchema.parse(input);

export const parseDeleteBalanceCommand = ({
	input,
}: {
	input: unknown;
}): DeleteBalanceCommand => deleteBalanceCommandSchema.parse(input);

export const parseRecalculateBalanceCommand = ({
	input,
}: {
	input: unknown;
}): RecalculateBalanceCommand => recalculateBalanceCommandSchema.parse(input);

export const parseFinalizeCommand = ({
	input,
}: {
	input: unknown;
}): FinalizeCommand => finalizeCommandSchema.parse(input);

export const parseInitializeCommand = ({
	input,
}: {
	input: unknown;
}): InitializeCommand => initializeCommandSchema.parse(input);

export const parseApplyBillingPlanRequest = ({
	input,
}: {
	input: unknown;
}): ApplyBillingPlanRequest => applyBillingPlanRequestSchema.parse(input);

export const parseInitializeRequest = ({
	input,
}: {
	input: unknown;
}): InitializeRequest => initializeRequestSchema.parse(input);

/** A lock row read back from Postgres, before it rides on a finalize command. */
export const parseWorkerLock = ({ input }: { input: unknown }): WorkerLock =>
	workerLockSchema.parse(input);

export const parseSubjectState = ({
	input,
}: {
	input: unknown;
}): SubjectState => subjectStateSchema.parse(input);

export const parseSubjectStateMutation = ({
	input,
}: {
	input: unknown;
}): SubjectStateMutation => subjectStateMutationSchema.parse(input);

export const parseMutationRecord = ({
	input,
}: {
	input: unknown;
}): MutationRecord => mutationRecordSchema.parse(input);

export const parseMeteringIdentity = ({
	input,
}: {
	input: unknown;
}): MeteringIdentity => meteringIdentitySchema.parse(input);

export const parseCatalog = ({ input }: { input: unknown }): Catalog =>
	catalogSchema.parse(input);

export const parseCatalogRow = ({ input }: { input: unknown }): CatalogRow =>
	catalogRowSchema.parse(input);

export const parseWorkerCustomerEntitlement = ({
	input,
}: {
	input: unknown;
}): WorkerCustomerEntitlement => workerCustomerEntitlementSchema.parse(input);
