import type {
	Entity,
	EntityRolloverBalance,
	Feature,
	FullCusProduct,
	FullCustomerEntitlement,
	Invoice,
	Product,
	ProductV2,
	Rollover,
} from "@autumn/shared";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { formatUnixToDate } from "../../utils/formatUtils/formatDateUtils";

export const getCusProductHoverTexts = (cusProduct: FullCusProduct) => {
	return [
		{
			key: "Cus Product ID",
			value: cusProduct.id,
		},
		...(cusProduct.subscription_ids
			? cusProduct.subscription_ids.map((id: string) => ({
					key: "Stripe Subscription ID",
					value: id,
				}))
			: []),
		...(cusProduct.scheduled_ids
			? [
					{
						key: "Stripe Scheduled IDs",
						value: cusProduct.scheduled_ids.join(", "),
					},
				]
			: []),
		{
			key: "Entity ID",
			value: cusProduct.entity_id || "N/A",
		},
	];
};

export const impersonateUser = async (userId: string) => {
	console.log("impersonating user", userId);
	try {
		await authClient.admin.stopImpersonating();
	} catch (error) {
		console.error(error);
	}
	const res = await authClient.admin.impersonateUser({
		userId,
	});

	if (res.error) {
		toast.error("Something went wrong");
		return;
	}

	window.location.reload();
};

export const getCusEntHoverTexts = ({
	cusEnt,
	entities,
}: {
	cusEnt?: FullCustomerEntitlement;
	entities: Entity[];
}) => {
	if (!cusEnt) return [];
	const entitlement = cusEnt.entitlement;
	const featureEntities = entities.filter(
		(e: Entity) => e.feature_id === entitlement.feature.id,
	);

	const hoverTexts = [
		{
			key: "Cus Ent ID",
			value: cusEnt.id,
		},
	];

	// NEW APPROACH: Check if cusEnt has internal_entity_id (entity-level loose entitlement)
	if (cusEnt.internal_entity_id) {
		const entity = entities.find(
			(e: Entity) => e.internal_id === cusEnt.internal_entity_id,
		);
		if (entity) {
			hoverTexts.push({
				key: "Entity",
				value: `${entity.id} (${entity.name})${entity.deleted ? " Deleted" : ""}`,
			});
		}
		// Always show internal_entity_id for debugging
		hoverTexts.push({
			key: "Internal Entity ID",
			value: cusEnt.internal_entity_id,
		});
	}
	// Check for per-entity features (features that ARE entity types)
	else if (featureEntities.length > 0) {
		hoverTexts.push({
			key: "Entities",
			value: featureEntities
				.map((e: Entity) => `${e.id} (${e.name})${e.deleted ? " Deleted" : ""}`)
				.join("\n"),
		});
	}
	// OLD APPROACH: entities object with per-entity balances
	else if (cusEnt.entities && Object.keys(cusEnt.entities).length > 0) {
		const mappedEntities = Object.keys(cusEnt.entities)
			.map((e: string) => {
				const entity = entities.find((ee: Entity) => ee.id === e);
				const balance = cusEnt.entities?.[e]?.balance;
				return `${entity?.id} (${entity?.name}): ${balance ?? "N/A"}`;
			})
			.join("\n");
		hoverTexts.push({
			key: "Entities",
			value: mappedEntities,
		});
	}

	const rollovers = cusEnt.rollovers ?? [];
	if (rollovers.length > 0) {
		hoverTexts.push({
			key: "Rollovers",
			value: rollovers
				.map((r: Rollover) => {
					const rolloverEntities = r.entities ? Object.values(r.entities) : [];
					if (rolloverEntities.length > 0) {
						return (
							rolloverEntities
								.map((e: EntityRolloverBalance) => `${e.balance} (${e.id})`)
								.join(", ") +
							` (expires: ${r.expires_at ? formatUnixToDate(r.expires_at) : "N/A"})`
						);
					} else {
						return `${r.balance} (ex: ${r.expires_at ? formatUnixToDate(r.expires_at) : "N/A"})`;
					}
				})
				.join("\n"),
		});
	}

	return hoverTexts;
};

export const getFeatureHoverTexts = ({ feature }: { feature: Feature }) => {
	const hoverTexts = [
		{
			key: "Internal ID",
			value: feature.internal_id || "",
		},
	];

	return hoverTexts;
};

export const getPlanHoverTexts = ({ plan }: { plan: Product | ProductV2 }) => {
	const hoverTexts = [
		{
			key: "Internal ID",
			value: plan.internal_id || "",
		},
	];

	if ("version" in plan && plan.version) {
		hoverTexts.push({
			key: "Version",
			value: plan.version.toString(),
		});
	}

	return hoverTexts;
};

export const getInvoiceHoverTexts = ({ invoice }: { invoice: Invoice }) => {
	const hoverTexts = [
		{
			key: "Invoice ID",
			value: invoice.id,
		},
		{
			key: "Stripe ID",
			value: invoice.stripe_id,
		},
	];

	return hoverTexts;
};
