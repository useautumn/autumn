import { type AutumnClient, createAutumnClient } from "@autumn/billing";
import { getAutumnEnv } from "@autumn/env";
import { onAwsEcs } from "@/external/aws/ecs/onAwsEcs.js";
import { billingEdgeUrl } from "./billingEdgeUrl.js";

type BillingCheckPath = "edge" | "api";

let billing: { autumn: AutumnClient; path: BillingCheckPath } | undefined;

/** Autumn's own org, billing Autumn's customers, and whether its checks go edge-first. */
export const getBillingAutumnClient = () => {
	if (billing) return billing;
	const edgeUrl = billingEdgeUrl({
		onEcs: onAwsEcs(),
		edgeUrl: getAutumnEnv().AUTUMN_EDGE_URL,
	});
	billing = {
		autumn: createAutumnClient({
			config: {
				secretKey: process.env.AUTUMN_SECRET_KEY ?? "",
				allowLiveKey: true,
				edgeUrl,
			},
		}),
		path: edgeUrl ? "edge" : "api",
	};
	return billing;
};
