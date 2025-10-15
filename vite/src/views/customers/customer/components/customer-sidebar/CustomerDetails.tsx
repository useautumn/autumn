import { faStripe } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ArrowUpRightFromSquare } from "lucide-react";
import { Link } from "react-router";
import Stripe from "stripe";
import CopyButton from "@/components/general/CopyButton";
import { SideAccordion } from "@/components/general/SideAccordion";
import { SidebarLabel } from "@/components/general/sidebar/sidebar-label";
import { Button } from "@/components/ui/button";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeCusLink } from "@/utils/linkUtils";
import { useCusQuery } from "../../hooks/useCusQuery";

export const CustomerDetails = ({
	setIsModalOpen,
	setModalType,
}: {
	setIsModalOpen: (isModalOpen: boolean) => void;
	setModalType: (modalType: string) => void;
}) => {
	const { customer } = useCusQuery();
	const env = useEnv();
	const { org } = useOrg();
	const { stripeAccount } = useOrgStripeQuery();

	return (
		<div className="flex w-full border-b mt-[2.5px] p-4">
			<SideAccordion title="Details" value="details">
				<div className="grid grid-cols-8 auto-rows-[16px] gap-y-4 w-full items-center">
					<SidebarLabel>ID</SidebarLabel>
					<div className="col-span-6 justify-end flex">
						<div className="w-full flex justify-end">
							{customer.id ? (
								<CopyButton text={customer.id} className="">
									{customer.id}
								</CopyButton>
							) : (
								<Button
									variant="sidebarItem"
									onClick={() => {
										setIsModalOpen(true);
										setModalType("customer");
									}}
								>
									<span className="truncate text-t3">N/A</span>
								</Button>
							)}
						</div>
					</div>

					<span className="text-t3 text-xs font-medium col-span-2">Name</span>
					<div className="col-span-6 justify-end flex">
						<Button
							variant="sidebarItem"
							onClick={() => {
								setIsModalOpen(true);
								setModalType("customer");
							}}
						>
							<span className="truncate">
								{customer.name || <span className="text-t3">None</span>}
							</span>
						</Button>
					</div>

					<span className="text-t3 text-xs font-medium col-span-2">Email</span>
					<div className="col-span-6 justify-end flex">
						<Button
							variant="sidebarItem"
							onClick={() => {
								setIsModalOpen(true);
								setModalType("customer");
							}}
						>
							<span className="truncate">
								{customer.email || <span className="text-t3">None</span>}
							</span>
						</Button>
					</div>

					<span className="text-t3 text-xs font-medium col-span-2">
						Fingerprint
					</span>
					<div className="col-span-6 justify-end flex">
						<Button
							variant="sidebarItem"
							className="text-t2 px-2 h-fit py-0.5"
							onClick={() => {
								setIsModalOpen(true);
								setModalType("customer");
							}}
						>
							<span className="truncate">
								{customer.fingerprint || <span className="text-t3">None</span>}
							</span>
						</Button>
					</div>

					{customer.processor?.id && (
						<>
							<span className="text-t3 text-xs font-medium col-span-2 h-4">
								Stripe
							</span>
							<div className="col-span-6">
								<div className="!cursor-pointer hover:underline">
									<div className="flex items-center gap-2 justify-end">
										<Button
											variant="sidebarItem"
											className="!cursor-pointer hover:underline"
											onClick={() => {
												if (stripeAccount) {
													window.open(
														getStripeCusLink({
															customerId: customer.processor?.id,
															env,
															accountId: stripeAccount.id,
														}),
														"_blank",
													);
												} else {
													window.location.href = getStripeCusLink({
														customerId: customer.processor?.id,
														env,
													});
												}
											}}
										>
											<FontAwesomeIcon
												icon={faStripe}
												className="!h-6 !w-6 text-t2"
											/>
											<ArrowUpRightFromSquare size={12} className="text-t2" />
										</Button>
									</div>
								</div>
							</div>
						</>
					)}
				</div>
			</SideAccordion>
		</div>
	);
};
