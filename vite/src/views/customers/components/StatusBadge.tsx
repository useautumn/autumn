import { Badge } from "@/components/ui/badge";
import { CusProductStatus } from "@autumn/shared";

export const StatusBadge = ({ status }: { status: string }) => {
	const statusToVariant: any = {
		[CusProductStatus.Active]: "green",
		[CusProductStatus.Scheduled]: "blue",
		[CusProductStatus.PastDue]: "yellow",
		[CusProductStatus.Expired]: "red",
	};

	return <Badge variant={statusToVariant[status]}>{status}</Badge>;
};
