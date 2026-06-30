import type {
	FullCusProduct,
	SyncPlanInstance,
} from "@autumn/shared";
import type { MatchedPlan } from "../detect/types";

export type TargetGroupLink = {
	key: string;
	productId: string;
};

const targetGroupKey = ({
	internalEntityId,
	group,
}: {
	internalEntityId?: string | null;
	group: string;
}) => `${internalEntityId ?? "customer"}:${group}`;

const normalizeProductGroup = ({
	group,
}: {
	group?: string | null;
}): string | null => {
	if (group == null || group === "") return null;
	return group;
};

export const matchedPlanToTargetGroupLink = ({
	matchedPlan,
	syncPlan,
}: {
	matchedPlan: MatchedPlan;
	syncPlan: SyncPlanInstance;
}): TargetGroupLink | null => {
	if (matchedPlan.product.is_add_on === true) return null;
	const group = normalizeProductGroup({ group: matchedPlan.product.group });
	if (!group) return null;

	return {
		key: targetGroupKey({ internalEntityId: syncPlan.entity_id, group }),
		productId: matchedPlan.product.id,
	};
};

export const linkedCustomerProductsToTargetGroupMap = ({
	linkedCustomerProducts,
}: {
	linkedCustomerProducts: FullCusProduct[];
}):
	| { ok: true; targets: Map<string, FullCusProduct> }
	| { ok: false } => {
	const targets = new Map<string, FullCusProduct>();

	for (const linkedProduct of linkedCustomerProducts) {
		if (linkedProduct.product.is_add_on === true) continue;

		const group = normalizeProductGroup({ group: linkedProduct.product.group });
		if (!group) return { ok: false };

		const key = targetGroupKey({
			internalEntityId: linkedProduct.internal_entity_id,
			group,
		});
		if (targets.has(key)) return { ok: false };

		targets.set(key, linkedProduct);
	}

	return { ok: true, targets };
};
