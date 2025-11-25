import type { Entitlement } from "@autumn/shared";
import { entitlements } from "@models/productModels/entModels/entTable";
import { eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle";
import { generateId } from "../../../utils/genUtils";

export const copyEnt = async ({
	db,
	entId,
	isCustom = true,
	internalProductId,
}: {
	db: DrizzleCli;
	entId: string;
	isCustom?: boolean;
	internalProductId?: string;
}) => {
	const ent = await db.query.entitlements.findFirst({
		where: eq(entitlements.id, entId),
	});

	let newEnt = structuredClone(ent!) as Entitlement;

	newEnt = {
		...newEnt,
		id: generateId("ent"),
		created_at: Date.now(),
		is_custom: isCustom ?? newEnt.is_custom,
		internal_product_id: internalProductId || newEnt.internal_product_id,
	};

	return newEnt;
};
