import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import { Link } from "react-router";
import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink, getStripeSubScheduleLink } from "@/utils/linkUtils";

export const CusProductStripeLink = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const env = useEnv();
	return (
		<>
			{cusProduct.subscription_ids &&
				cusProduct.subscription_ids.length > 0 &&
				cusProduct.subscription_ids.map((subId: string) => {
					return (
						<Link
							key={subId}
							to={getStripeSubLink(subId, env)}
							target="_blank"
							onClick={(e) => {
								e.stopPropagation();
							}}
						>
							<div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
								<ArrowUpRightFromSquare size={12} className="text-[#665CFF]" />
							</div>
						</Link>
					);
				})}
			{cusProduct.status === CusProductStatus.Scheduled &&
				cusProduct.scheduled_ids &&
				cusProduct.scheduled_ids.length > 0 &&
				cusProduct.scheduled_ids.map((subId: string) => {
					return (
						<Link
							key={subId}
							to={getStripeSubScheduleLink(subId, env)}
							target="_blank"
							onClick={(e) => {
								e.stopPropagation();
							}}
						>
							<div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
								<ArrowUpRightFromSquare size={12} className="text-[#665CFF]" />
							</div>
						</Link>
					);
				})}
		</>
	);
};
