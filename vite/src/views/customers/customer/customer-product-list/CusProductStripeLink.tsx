import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import { ArrowUpRightFromSquare } from "lucide-react";
import React from "react";
import { Link } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeSubLink, getStripeSubScheduleLink } from "@/utils/linkUtils";

export const CusProductStripeLink = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const env = useEnv();
	const { org } = useOrg();
	const { stripeAccount } = useOrgStripeQuery();
	return (
		<>
			{cusProduct.subscription_ids &&
				cusProduct.subscription_ids.length > 0 && (
					<React.Fragment>
						{cusProduct.subscription_ids.map((subId: string) => {
							return (
								<div
									key={subId}
									onClick={(e) => {
										e.stopPropagation();
										if (stripeAccount) {
											window.open(
												getStripeSubLink({
													subscriptionId: subId,
													env,
													accountId: stripeAccount.id,
												}),
												"_blank",
											);
										} else {
											window.open(
												getStripeSubLink({ subscriptionId: subId, env }),
											);
										}
									}}
								>
									<div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
										<ArrowUpRightFromSquare
											size={12}
											className="text-[#665CFF]"
										/>
									</div>
								</div>
							);
						})}
					</React.Fragment>
				)}
			{cusProduct.status == CusProductStatus.Scheduled &&
				cusProduct.scheduled_ids &&
				cusProduct.scheduled_ids.length > 0 && (
					<React.Fragment>
						{cusProduct.scheduled_ids.map((subId: string) => {
							return (
								<div
									key={subId}
									onClick={(e) => {
										e.stopPropagation();
										if (stripeAccount) {
											window.open(
												getStripeSubScheduleLink({
													scheduledId: subId,
													env,
													accountId: stripeAccount.id,
												}),
												"_blank",
											);
										} else {
											window.open(
												getStripeSubScheduleLink({ scheduledId: subId, env }),
											);
										}
									}}
								>
									<div className="flex justify-center items-center w-fit px-2 gap-2 h-6">
										<ArrowUpRightFromSquare
											size={12}
											className="text-[#665CFF]"
										/>
									</div>
								</div>
							);
						})}
					</React.Fragment>
				)}
		</>
	);
};
