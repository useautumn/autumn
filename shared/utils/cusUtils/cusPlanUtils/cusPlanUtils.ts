import { CusProductStatus } from "@models/cusProductModels/cusProductEnums.js";

export const cusProductToPlanStatus = ({
	status,
}: {
	status: CusProductStatus;
}) => {
	switch (status) {
		case CusProductStatus.Active:
			return "active";
		case CusProductStatus.PastDue:
			return "active";
		case CusProductStatus.Expired:
			return "expired";
		case CusProductStatus.Scheduled:
			return "scheduled";
		default:
			return "active";
	}
};
