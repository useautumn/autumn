import { OrgAllowlistEdgeConfigForm } from "./OrgAllowlistEdgeConfigForm";
import {
	STRIPE_SYNC_QUERY_KEY,
	type StripeSyncConfig,
} from "./stripeSyncConfigTypes";

export const StripeSyncConfigForm = ({
	config,
	onClose,
}: {
	config: StripeSyncConfig;
	onClose: () => void;
}) => (
	<OrgAllowlistEdgeConfigForm
		config={config}
		onClose={onClose}
		endpoint="/admin/stripe-sync-config"
		queryKey={STRIPE_SYNC_QUERY_KEY}
		successMessage="Stripe sync config saved"
		errorMessage="Failed to save stripe sync config"
		enabledDescription="Listed orgs get synced. Everyone else is off."
		emptyMessage="No orgs enabled — sync is off everywhere."
		missingConfigMessage="Stripe sync config is missing in S3, so sync stays off for every org."
		orgPlaceholder="Org ID or slug"
	/>
);
