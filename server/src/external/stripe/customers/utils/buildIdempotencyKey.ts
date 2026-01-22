import { hashString } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

export const buildStripeCustomerIdempotencyKey = ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): string => {
	const { org, env } = ctx;
	return hashString(
		`stripe-create-cus:${customerId}:${org.id}:${env}:${Math.floor(Date.now() / 5000)}`,
	);
};
