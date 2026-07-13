import type { FullCusProduct } from "@autumn/shared";
import { AppEnv, ProcessorType } from "@autumn/shared";
import {
	Button,
	Dialog,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	useDropdownShortcut,
} from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	ArrowsClockwiseIcon,
	BroomIcon,
	CaretDownIcon,
	PencilSimpleIcon,
	SlidersHorizontalIcon,
	SubtractIcon,
	TicketIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { getRevenueCatCusLink } from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
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
	const [clearCacheLoading, setClearCacheLoading] = useState(false);
	const { customer } = useCusQuery();
	const { org } = useOrg({ skipSandbox: false });
	const { isAdmin } = useAdmin();
	const setSheet = useSheetStore((s) => s.setSheet);
	const env = useEnv();
	const axiosInstance = useAxiosInstance();

	const stripeCustomerId = customer?.processor?.id;

	// Open dropdown with "a" key
	useDropdownShortcut({
		shortcut: "a",
		isOpen: actionsOpen,
		setIsOpen: setActionsOpen,
	});

	const handleClearCache = async () => {
		if (!customer) return;
		setClearCacheLoading(true);
		try {
			await CusService.clearCache({
				axios: axiosInstance,
				customer_id: customer.id || customer.internal_id,
			});
			toast.success("Customer cache cleared");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to clear cache"));
		} finally {
			setClearCacheLoading(false);
			setActionsOpen(false);
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
						<CaretDownIcon className="size-3.5 text-tertiary-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" keepMounted>
					<DropdownMenuItem
						onClick={() => setIsModalOpen(true)}
						className="flex gap-2"
						shortcut="e"
					>
						<PencilSimpleIcon />
						Edit customer
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => {
							setSheet({ type: "customer-config-edit" });
							setActionsOpen(false);
						}}
						className="flex gap-2"
						shortcut="g"
					>
						<SlidersHorizontalIcon />
						Edit config
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => setCreateEntityOpen(true)}
						className="flex gap-2"
						shortcut="n"
					>
						<SubtractIcon />
						Create entity
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => setAddCouponOpen(true)}
						className="flex gap-2"
						shortcut="c"
					>
						<TicketIcon />
						Add coupon
					</DropdownMenuItem>
					{stripeCustomerId &&
						customer?.processor?.type === ProcessorType.Stripe && (
							<DropdownMenuItem
								onClick={() => {
									setSheet({ type: "sync-stripe-v2" });
									setActionsOpen(false);
								}}
								className="flex gap-2"
								shortcut="y"
							>
								<ArrowsClockwiseIcon />
								Sync from Stripe
							</DropdownMenuItem>
						)}
					{isAdmin && (
						<DropdownMenuItem
							onClick={() => {
								window.open(
									`https://i.useautumn.com/customers/${customer?.internal_id}`,
									"_blank",
								);
							}}
							className="flex gap-2"
							shortcut="p"
						>
							<ArrowSquareOutIcon className="size-3.5" />
							Open in Admin Panel
						</DropdownMenuItem>
					)}
					{isAdmin && (
						<DropdownMenuItem
							onClick={handleClearCache}
							className="flex gap-2"
							disabled={clearCacheLoading}
							shortcut="x"
						>
							<BroomIcon />
							{clearCacheLoading ? "Clearing..." : "Clear cache"}
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
							shortcut="r"
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
						shortcut="d"
					>
						<TrashIcon />
						Delete customer
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
