import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";

export const InvitePopover = () => {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);

	const handleInvite = async () => {
		try {
			setLoading(true);
			const { data, error } = await authClient.organization.inviteMember({
				email: email,
				role: "admin",
				resend: true,
			});

			if (error) throw error;

			toast.success(`Successfully sent invitation to ${email}`);

			setOpen(false);
		} catch (error) {
			console.error(error);
			toast.error(getBackendErr(error, "Failed to invite user"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="primary">Invite</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className=" flex flex-col gap-2 pt-3">
				<div className="flex items-center gap-1 text-t3">
					<Mail size={12} />
					<p className="text-t3 text-sm">Invite by email</p>
				</div>

				<div className="flex items-center gap-2">
					<Input
						className="h-7"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Button
						variant="primary"
						className="!h-6.5 !mt-0"
						// endIcon={<Plus size={10} />}
						onClick={handleInvite}
						isLoading={loading}
					>
						Send
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
