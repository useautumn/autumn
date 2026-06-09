import { expect } from "bun:test";
import type {
	PreviewBalanceChange,
	PreviewMigrateCustomer,
	PreviewPlanChange,
	PreviewPlanItemChange,
} from "./previewTestUtils";

type PreviewBalanceExpectation = Partial<PreviewBalanceChange["balance"]>;

const getPreviewPlanId = (change: PreviewPlanChange): string | undefined =>
	change.subscription?.plan_id ?? change.purchase?.plan_id;

export const logMigrationPreview = ({
	preview,
	log = true,
}: {
	preview: PreviewMigrateCustomer;
	log?: boolean;
}) => {
	if (!log) return;
	console.log("MIGRATION_PREVIEW", JSON.stringify(preview, null, 2));
};

export const expectMigrationPreviewCorrect = ({
	preview,
	customerId,
	log = true,
}: {
	preview: PreviewMigrateCustomer;
	customerId?: string;
	log?: boolean;
}) => {
	logMigrationPreview({ preview, log });
	expect(preview.object).toBe("migration_customer_preview");
	if (customerId) expect(preview.customer_id).toBe(customerId);

	expect(Array.isArray(preview.plan_changes)).toBe(true);
	expect(Array.isArray(preview.balance_changes)).toBe(true);
	expect(Array.isArray(preview.flag_changes)).toBe(true);

	for (const planChange of preview.plan_changes) {
		expect(typeof planChange).toBe("object");
		expect(planChange).not.toBeNull();
		expect(Array.isArray(planChange.item_changes)).toBe(true);
		for (const itemChange of planChange.item_changes) {
			expect(itemChange.item).toEqual(
				expect.objectContaining({
					feature_id: itemChange.feature_id,
				}),
			);
		}
	}
};

export const expectPreviewPlanChange = ({
	preview,
	action,
	planId,
	itemChanges,
}: {
	preview: PreviewMigrateCustomer;
	action: PreviewPlanChange["action"];
	planId: string;
	itemChanges?: Partial<PreviewPlanItemChange>[];
}): PreviewPlanChange => {
	const matchingPlanChanges = preview.plan_changes.filter(
		(change) => change.action === action && getPreviewPlanId(change) === planId,
	);
	const planChange = itemChanges
		? matchingPlanChanges.find((change) => change.item_changes.length > 0)
		: matchingPlanChanges[0];
	expect(planChange).toBeDefined();

	if (itemChanges) {
		expect(planChange?.item_changes).toEqual(
			expect.arrayContaining(
				itemChanges.map((itemChange) => expect.objectContaining(itemChange)),
			),
		);
	}

	return planChange!;
};

export const expectPreviewBalanceChange = ({
	preview,
	featureId,
	balance,
	previousAttributes,
	absentPreviousAttributes = [],
}: {
	preview: PreviewMigrateCustomer;
	featureId: string;
	balance?: PreviewBalanceExpectation;
	previousAttributes?: Record<string, unknown>;
	absentPreviousAttributes?: string[];
}): PreviewBalanceChange => {
	const balanceChange = preview.balance_changes.find(
		(change) => change.feature_id === featureId,
	);
	expect(balanceChange).toBeDefined();

	if (balance) {
		expect(balanceChange?.balance).toEqual(expect.objectContaining(balance));
	}
	if (previousAttributes) {
		expect(balanceChange?.previous_attributes).toEqual(
			expect.objectContaining(previousAttributes),
		);
	}
	for (const field of absentPreviousAttributes) {
		expect(balanceChange?.previous_attributes).not.toHaveProperty(field);
	}

	return balanceChange!;
};

export const expectNoPreviewBalanceChange = ({
	preview,
	featureId,
}: {
	preview: PreviewMigrateCustomer;
	featureId: string;
}) => {
	expect(
		preview.balance_changes.some((change) => change.feature_id === featureId),
	).toBe(false);
};

export const expectPreviewFlagChanges = ({
	preview,
	changes,
}: {
	preview: PreviewMigrateCustomer;
	changes: Array<{ action: "created" | "deleted"; feature_id: string }>;
}) => {
	expect(preview.flag_changes).toEqual(expect.arrayContaining(changes));
};
