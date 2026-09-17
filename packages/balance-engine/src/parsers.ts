import {
	type CheckCommand,
	checkCommandSchema,
} from "./commands/check/types/checkCommand.js";
import {
	type InitializeCommand,
	initializeCommandSchema,
} from "./commands/initialize/types/initializeCommand.js";
import {
	type TrackCommand,
	trackCommandSchema,
} from "./commands/track/types/trackCommand.js";
import { type Catalog, catalogSchema } from "./models/catalog/catalog.js";
import {
	type CatalogRow,
	catalogRowSchema,
} from "./models/catalog/catalogRow.js";
import {
	type MeteringIdentity,
	meteringIdentitySchema,
} from "./models/meteringIdentity.js";
import {
	type WorkerCustomerEntitlement,
	workerCustomerEntitlementSchema,
} from "./models/rows/workerCustomerEntitlement.js";
import {
	type SubjectState,
	subjectStateSchema,
} from "./models/subjectState.js";
import {
	type SubjectStateMutation,
	subjectStateMutationSchema,
} from "./models/subjectStateMutation.js";

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

export const parseInitializeCommand = ({
	input,
}: {
	input: unknown;
}): InitializeCommand => initializeCommandSchema.parse(input);

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
