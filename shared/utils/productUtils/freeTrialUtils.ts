import type {
	CreateFreeTrial,
	FreeTrial,
} from "../../models/productModels/freeTrialModels/freeTrialModels.js";

export const freeTrialsAreSame = ({
	ft1,
	ft2,
}: {
	ft1?: FreeTrial | CreateFreeTrial | null;
	ft2?: FreeTrial | CreateFreeTrial | null;
}) => {
	if (!ft1 && !ft2) return true;
	if (!ft1 || !ft2) return false;
	return (
		ft1.length === ft2.length &&
		ft1.unique_fingerprint === ft2.unique_fingerprint &&
		ft1.duration === ft2.duration &&
		ft1.card_required === ft2.card_required
	);
};
