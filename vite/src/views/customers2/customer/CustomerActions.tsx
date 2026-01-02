import type { Feature, FullCusProduct } from "@autumn/shared";
import { AppEnv, FeatureUsageType, ProcessorType } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	CaretDownIcon,
	PencilSimpleIcon,
	SubtractIcon,
	TicketIcon,
	TrashIcon,
	UserCircleGearIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Dialog } from "@/components/v2/dialogs/Dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useDropdownShortcut } from "@/hooks/useDropdownShortcut";
import { cn } from "@/lib/utils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getRevenueCatCusLink, getStripeCusLink } from "@/utils/linkUtils";
import { DeleteCustomerDialog } from "@/views/customers/customer/components/DeleteCustomerDialog";
import UpdateCustomerDialog from "@/views/customers/customer/components/UpdateCustomerDialog";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { AddCouponDialog } from "./components/AddCouponDialog";
import { CreateEntity } from "./components/CreateEntity";

export function CustomerActions() {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [createEntityOpen, setCreateEntityOpen] = useState(false);
	const [addCouponOpen, setAddCouponOpen] = useState(false);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [portalLoading, setPortalLoading] = useState(false);
	const { customer } = useCusQuery();
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const axiosInstance = useAxiosInstance();

	const stripeCustomerId = customer?.processor?.id;

	const hasContinuousUseFeatures = features?.some(
		(feature: Feature) =>
			feature.config?.usage_type === FeatureUsageType.Continuous,
	);

	// Open dropdown with "a" key
	useDropdownShortcut({
		shortcut: "a",
		isOpen: actionsOpen,
		setIsOpen: setActionsOpen,
	});

	const handleOpenBillingPortal = async () => {
		if (!customer) return;

		setPortalLoading(true);
		try {
			const { url } = await CusService.createBillingPortalSession({
				axios: axiosInstance,
				customer_id: customer.id || customer.internal_id,
			});
			window.open(url, "_blank");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to open billing portal"));
		} finally {
			setPortalLoading(false);
		}
	};

	return (
		<div className="flex items-center gap-2">
			<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
				<UpdateCustomerDialog
					selectedCustomer={customer}
					open={isModalOpen}
					setOpen={setIsModalOpen}
				/>
			</Dialog>
			<DeleteCustomerDialog
				customer={customer}
				open={deleteOpen}
				setOpen={setDeleteOpen}
				redirectToCustomersPage
			/>
			<CreateEntity open={createEntityOpen} setOpen={setCreateEntityOpen} />
			<AddCouponDialog open={addCouponOpen} setOpen={setAddCouponOpen} />

			<DropdownMenu open={actionsOpen} onOpenChange={setActionsOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						size="mini"
						variant="secondary"
						className={cn("gap-1", actionsOpen && "btn-secondary-active")}
					>
						Actions
						<CaretDownIcon className="size-3.5 text-t3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onClick={() => setIsModalOpen(true)}
						className="flex gap-2"
					>
						<PencilSimpleIcon />
						Edit customer
					</DropdownMenuItem>
					{hasContinuousUseFeatures && (
						<DropdownMenuItem
							onClick={() => setCreateEntityOpen(true)}
							className="flex gap-2"
						>
							<SubtractIcon />
							Create entity
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={() => setAddCouponOpen(true)}
						className="flex gap-2"
					>
						<TicketIcon />
						Add coupon
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={handleOpenBillingPortal}
						className="flex gap-2"
						disabled={portalLoading}
						shortcut="b"
					>
						<UserCircleGearIcon />
						{portalLoading ? "Opening..." : "Open customer portal"}
					</DropdownMenuItem>
					{stripeCustomerId &&
						customer?.processor?.type === ProcessorType.Stripe && (
							<DropdownMenuItem
								onClick={() => {
									window.open(
										getStripeCusLink({
											customerId: stripeCustomerId,
											env,
											accountId: stripeAccount?.id,
										}),
										"_blank",
									);
								}}
								className="flex gap-2"
								shortcut="s"
							>
								<ArrowSquareOutIcon className="size-3.5" />
								Open in Stripe
							</DropdownMenuItem>
						)}
					{((customer?.processor?.id &&
						customer.processor.type === ProcessorType.RevenueCat) ||
						customer?.customer_products?.some(
							(cp: FullCusProduct) =>
								cp.processor?.type === ProcessorType.RevenueCat,
						)) && (
						<DropdownMenuItem
							onClick={() => {
								window.open(
									getRevenueCatCusLink({
										customerId: customer.id,
										projectId:
											env === AppEnv.Live
												? (org?.processor_configs?.revenuecat?.project_id?.replace(
														"proj",
														"",
													) ?? "")
												: (org?.processor_configs?.revenuecat?.sandbox_project_id?.replace(
														"proj",
														"",
													) ?? ""),
									}),
									"_blank",
								);
							}}
							className="flex gap-2"
						>
							<ArrowSquareOutIcon className="size-3.5" />
							Open in RevenueCat
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setDeleteOpen(true)}
						variant="destructive"
						className="flex gap-2 text-red-500 !hover:bg-red-500"
					>
						<TrashIcon />
						Delete customer
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
