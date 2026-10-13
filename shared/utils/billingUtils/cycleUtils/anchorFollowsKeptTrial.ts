/** A backdate that keeps a trialing subscription's trial and anchors the cycle after it ends, so Stripe bills a stub between. */
export const anchorFollowsKeptTrial = ({
	backdatesTrialingSubscription,
	keepsTrial,
	anchorMs,
	trialEndsAt,
}: {
	backdatesTrialingSubscription: boolean;
	keepsTrial: boolean;
	anchorMs?: number | null;
	trialEndsAt?: number | null;
}) =>
	backdatesTrialingSubscription &&
	keepsTrial &&
	typeof anchorMs === "number" &&
	typeof trialEndsAt === "number" &&
	anchorMs > trialEndsAt;
