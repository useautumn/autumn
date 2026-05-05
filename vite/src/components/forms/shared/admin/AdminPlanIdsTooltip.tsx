import type { ReactNode } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useAdmin } from "@/views/admin/hooks/useAdmin";

export type AdminPlanIds = {
	stripe_price_id?: string | null;
	stripe_product_id?: string | null;
	internal_product_id?: string | null;
};

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => {
	if (!value) return null;
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-[10px] uppercase tracking-wide text-t4">
				{label}
			</span>
			<code className="text-xs font-mono text-t1 break-all">{value}</code>
		</div>
	);
};

/**
 * Wraps a child with an admin-only hover tooltip showing identifying IDs
 * for the displayed plan/price. No-op for non-admin users.
 */
export const AdminPlanIdsTooltip = ({
	children,
	ids,
}: {
	children: ReactNode;
	ids: AdminPlanIds;
}) => {
	const { isAdmin } = useAdmin();

	const hasAnyId = Boolean(
		ids.stripe_price_id || ids.stripe_product_id || ids.internal_product_id,
	);

	if (!isAdmin || !hasAnyId) {
		return <>{children}</>;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side="bottom"
				align="start"
				className="flex flex-col gap-2 max-w-sm"
			>
				<Row label="Stripe price id" value={ids.stripe_price_id} />
				<Row label="Stripe product id" value={ids.stripe_product_id} />
				<Row label="Autumn internal id" value={ids.internal_product_id} />
			</TooltipContent>
		</Tooltip>
	);
};
