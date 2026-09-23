import { Badge } from "@autumn/ui";

/** A plan Autumn holds that nothing in Stripe bills. */
export function NotFoundBadge() {
	return (
		<Badge variant="muted" size="sm" className="text-amber-500">
			Not found
		</Badge>
	);
}
