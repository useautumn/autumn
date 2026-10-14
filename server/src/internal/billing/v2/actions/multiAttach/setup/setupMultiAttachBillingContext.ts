import type {
	MultiAttachBillingContext,
	MultiAttachParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupImmediateMultiProductBillingContext } from "../../common/immediateMultiProduct/setupImmediateMultiProductBillingContext";

export const setupMultiAttachBillingContext = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: MultiAttachParamsV0;
	preview?: boolean;
}): Promise<MultiAttachBillingContext> =>
	setupImmediateMultiProductBillingContext({
		ctx,
		params,
		preview,
		billingStartsAt: params.starts_at,
	});
