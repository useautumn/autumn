import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";

export const LeaveOrgPopover = () => {
	const { org } = useOrg();
	const { data: organizations } = useListOrganizations();
	const { data: session } = useSession();
	const [confirmText, setConfirmText] = useState("");
	const [leaving, setLeaving] = useState(false);

	const leaveOrg = async () => {
		if (!organizations || !session?.user?.email) {
			toast.error("Failed to leave org");
			return;
		}

		if (organizations.length === 1) {
			toast.error("You must have at least one organization");
			return;
		}

		if (confirmText !== org?.name) {
			toast.error("Please type the org name to confirm");
			return;
		}

		await authClient.organization.removeMember({
			memberIdOrEmail: session.user.email,
			organizationId: org.id,
		});

		const otherOrg = organizations.find((o) => o.id !== org.id);
		await authClient.organization.setActive({
			organizationId: otherOrg!.id,
		});

		window.location.reload();
	};

	const handleLeaveClicked = async () => {
		setLeaving(true);
		try {
			await leaveOrg();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to leave org"));
		}
		setLeaving(false);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="secondary" className="w-fit">
					Leave Organization
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start">
				<div className="flex flex-col gap-4 text-sm w-fit">
					<p className="text-t3">
						Are you sure you want to leave this organization?
					</p>
					<Input
						placeholder={`Type "${org?.name}" to confirm`}
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
					/>
					<Button
						variant="destructive"
						className="w-fit"
						isLoading={leaving}
						onClick={handleLeaveClicked}
					>
						Confirm
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
