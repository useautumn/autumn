import type { Customer } from "@autumn/shared";
import { Delete, Settings } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import SmallSpinner from "@/components/general/SmallSpinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { navigateTo } from "@/utils/genUtils";
import AddCouponDialogContent from "./add-coupon/AddCouponDialogContent";
import { useCustomerContext } from "./CustomerContext";
import UpdateCustomerDialog from "./UpdateCustomerDialog";

export const CustomerToolbar = ({
	className,
	customer,
}: {
	className?: string;
	customer: Customer;
}) => {
	const navigate = useNavigate();
	const { env } = useCustomerContext();

	const axiosInstance = useAxiosInstance({ env });
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [modalOpen, setModalOpen] = useState(false);
	const [modalType, _setModalType] = useState<"add-coupon" | "edit">(
		"add-coupon",
	);

	const handleDelete = async () => {
		setDeleteLoading(true);
		try {
			await CusService.deleteCustomer(
				axiosInstance,
				customer.id || customer.internal_id,
			);
			navigateTo("/customers", navigate, env);
		} catch (_error) {
			toast.error("Failed to delete customer");
		}
		setDeleteLoading(false);
		setDeleteOpen(false);
	};

	return (
		<Dialog open={modalOpen} onOpenChange={setModalOpen}>
			<DialogTrigger asChild></DialogTrigger>
			{modalOpen && modalType === "add-coupon" ? (
				<AddCouponDialogContent setOpen={setModalOpen} />
			) : (
				<UpdateCustomerDialog
					selectedCustomer={customer}
					open={modalOpen}
					setOpen={setModalOpen}
				/>
			)}

			<DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						isIcon
						variant="ghost"
						dim={6}
						className={cn("rounded-full text-t3", className)}
					>
						<Settings size={14} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="text-t2 w-[150px]" align="end">
					<DropdownMenuItem
						className="flex items-center text-red-500 hover:!bg-red-500 hover:!text-white"
						onClick={async (e) => {
							e.stopPropagation();
							e.preventDefault();
							await handleDelete();
						}}
					>
						<div className="flex items-center justify-between w-full gap-2">
							Delete
							{deleteLoading ? <SmallSpinner /> : <Delete size={12} />}
						</div>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</Dialog>
	);
};
