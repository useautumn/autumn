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
	type CustomerState,
	customerStateSchema,
} from "./models/customerState.js";
import {
	type CustomerStateMutation,
	customerStateMutationSchema,
} from "./models/customerStateMutation.js";
import {
	type MeteringIdentity,
	meteringIdentitySchema,
} from "./models/meteringIdentity.js";

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

export const parseCustomerState = ({
	input,
}: {
	input: unknown;
}): CustomerState => customerStateSchema.parse(input);

export const parseCustomerStateMutation = ({
	input,
}: {
	input: unknown;
}): CustomerStateMutation => customerStateMutationSchema.parse(input);

export const parseMeteringIdentity = ({
	input,
}: {
	input: unknown;
}): MeteringIdentity => meteringIdentitySchema.parse(input);

export const parseCatalog = ({ input }: { input: unknown }): Catalog =>
	catalogSchema.parse(input);

export const parseCatalogRow = ({ input }: { input: unknown }): CatalogRow =>
	catalogRowSchema.parse(input);
