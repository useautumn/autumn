import type { Feature } from "@autumn/shared";
import { FeatureUsageType } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	DotsThreeVertical,
	PencilIcon,
	Subtract,
	Ticket,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/v2/buttons/Button";
import { Dialog } from "@/components/v2/dialogs/Dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeCusLink } from "@/utils/linkUtils";
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
	const { customer } = useCusQuery();
	const { features } = useFeaturesQuery();
	const env = useEnv();
	const { stripeAccount } = useOrgStripeQuery();

	const hasContinuousUseFeatures = features?.some(
		(feature: Feature) =>
			feature.config?.usage_type === FeatureUsageType.Continuous,
	);

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
			<Button
				size="mini"
				variant="secondary"
				onClick={() => setIsModalOpen(true)}
				className="gap-1"
			>
				<PencilIcon className="text-t3" />
				Edit Customer
			</Button>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="icon" variant="secondary">
						<DotsThreeVertical size={16} className="text-t2" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{hasContinuousUseFeatures && (
						<DropdownMenuItem
							onClick={() => setCreateEntityOpen(true)}
							className="flex gap-3"
						>
							<Subtract size={12} />
							Create entity
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={() => setAddCouponOpen(true)}
						className="flex gap-3"
					>
						<Ticket size={12} />
						Add coupon
					</DropdownMenuItem>
					{customer?.processor?.id && (
						<DropdownMenuItem
							onClick={() => {
								window.open(
									getStripeCusLink({
										customerId: customer.processor.id,
										env,
										accountId: stripeAccount?.id,
									}),
									"_blank",
								);
							}}
							className="flex gap-3"
						>
							<ArrowSquareOutIcon size={12} />
							Open in Stripe
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				size="icon"
				variant="secondary"
				onClick={() => setDeleteOpen(true)}
			>
				<TrashIcon className="text-t3" />
			</Button>
		</div>
	);
}
