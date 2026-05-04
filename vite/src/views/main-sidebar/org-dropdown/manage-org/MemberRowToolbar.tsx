import type { Invite, Membership } from "@autumn/shared";
import { EllipsisVertical, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useMemberships } from "../hooks/useMemberships";

export const MemberRowToolbar = ({
	membership,
	invite,
}: {
	membership?: Membership;
	invite?: Invite;
}) => {
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const { refetch } = useMemberships();
	const axiosInstance = useAxiosInstance();

	const handleDeleteMember = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		if (!membership) {
			console.error("No membership data available");
			toast.error("Cannot remove member: membership data not found");
			return;
		}

		setDeleteLoading(true);
		try {
			if (!membership.member.id || !membership.user.id) {
				toast.error("Invalid member data");
				return;
			}

			await axiosInstance.post("/organization/remove-member", {
				memberId: membership.member.id,
				userId: membership.user.id,
			});

			await refetch();
			toast.success("Member removed successfully");
			setOpen(false);
		} catch (error: any) {
			console.error("Member removal error:", error);
			if (error.response?.data?.code === "MEMBER_NOT_FOUND") {
				toast.error("Member not found in this organization");
			} else {
				toast.error("Failed to remove member. Please try again.");
			}
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleDeleteInvite = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		setDeleteLoading(true);
		try {
			const { error } = await authClient.organization.cancelInvitation({
				invitationId: invite!.id,
			});
			if (error) {
				toast.error(error.message);
				return;
			}

			await refetch();
			toast.success("Invite cancelled");
			setOpen(false);
		} catch {
			toast.error("Failed to remove invite");
		} finally {
			setDeleteLoading(false);
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<IconButton
					variant="skeleton"
					size="icon"
					iconOrientation="center"
					icon={<EllipsisVertical />}
					className="!h-5 !w-5 rounded-lg hover:bg-stone-50"
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem
					variant="destructive"
					shimmer={deleteLoading}
					className="flex justify-between"
					onClick={(e) => {
						if (membership) {
							handleDeleteMember(e);
						} else {
							handleDeleteInvite(e);
						}
					}}
				>
					<div className="flex justify-between items-center w-full gap-4">
						<span>Remove</span>
						<TrashIcon size={12} />
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
