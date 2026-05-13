import type { ReactNode } from "react";
import { AdminHover } from "@/components/general/AdminHover";

export type AdminPlanIds = {
	stripe_price_id?: string | null;
	stripe_product_id?: string | null;
	internal_product_id?: string | null;
};

export const AdminPlanIdsTooltip = ({
	children,
	ids,
}: {
	children: ReactNode;
	ids: AdminPlanIds;
}) => {
	const texts = [
		ids.stripe_price_id && {
			key: "Stripe price id",
			value: ids.stripe_price_id,
		},
		ids.stripe_product_id && {
			key: "Stripe product id",
			value: ids.stripe_product_id,
		},
		ids.internal_product_id && {
			key: "Autumn internal id",
			value: ids.internal_product_id,
		},
	].filter(Boolean) as { key: string; value: string }[];

	if (texts.length === 0) return <>{children}</>;

	return <AdminHover texts={texts}>{children}</AdminHover>;
};
