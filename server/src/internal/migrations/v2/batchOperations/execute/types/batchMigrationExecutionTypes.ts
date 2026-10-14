import type {
	CusProductStatus,
	EntitlementWithFeature,
	FullProductWithoutLicenses,
	MigrationItemRunSkipReason,
} from "@autumn/shared";

export type BatchMigrationPageCustomer = {
	internalId: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

export type BatchMigrationInsertedItem = {
	internalCustomerId: string;
	customerProductId: string;
	planId: string;
	featureId: string;
	granted: number | null;
	remaining?: number | null;
	unlimited: boolean;
	nextResetAt: number | null;
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
};

export type BatchMigrationRemovedItem = Omit<
	BatchMigrationInsertedItem,
	"granted" | "unlimited" | "nextResetAt" | "remaining"
> & {
	entitlement: EntitlementWithFeature;
	granted?: number | null;
	remaining?: number | null;
	unlimited?: boolean;
	nextResetAt?: number | null;
};

export type BatchMigrationRepointedProduct = {
	internalCustomerId: string;
	customerProductId: string;
	entityId: string | null;
	status: CusProductStatus;
	startsAt: number | null;
	canceledAt: number | null;
	endedAt: number | null;
	trialEndsAt: number | null;
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
};

export type BatchMigrationPageResult = {
	succeeded: BatchMigrationPageCustomer[];
	skipped: BatchMigrationPageCustomer[];
	skipReasons?: Record<string, MigrationItemRunSkipReason>;
	insertedItems: BatchMigrationInsertedItem[];
	removedItems: BatchMigrationRemovedItem[];
	repointedProducts?: BatchMigrationRepointedProduct[];
};

export type BatchMigrationExecutionSummary = {
	pages: number;
	succeeded: number;
	skipped: number;
	phases: Record<string, number>;
};

export type BatchMigrationChunkResult = {
	processed: number;
	completion: "exhausted" | "slice_complete" | "stopped";
	cursor: string | null;
	summary: BatchMigrationExecutionSummary;
};
