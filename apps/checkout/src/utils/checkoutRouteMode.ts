export type CheckoutRouteMode = "attach" | "update_subscription";

export const checkoutRouteTitle = ({
	routeMode,
}: {
	routeMode: CheckoutRouteMode;
}) => {
	return routeMode === "update_subscription"
		? "Confirm your update"
		: "Confirm your order";
};
