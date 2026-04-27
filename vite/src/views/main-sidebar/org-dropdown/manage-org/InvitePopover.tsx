import type { Role } from "@autumn/shared";
import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { RoleSelect } from "@/components/v2/selects/RoleSelect";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";
import { useMemberships } from "../hooks/useMemberships";

const emailSchema = z.email();

// Owners can invite co-owners (better-auth supports multiple owners on a
// single org). We expose the full role set here and let the server's AC
// gate the action — if a non-owner tries to send `role: "owner"` they'll
// get a 403 back from better-auth's invite endpoint.
const INVITE_ROLES: Role[] = ["owner", "admin", "developer", "sales", "member"];

export const InvitePopover = () => {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<Role>("developer");
	const [loading, setLoading] = useState(false);
	const [open, setOpen] = useState(false);
	const { refetch } = useMemberships();

	const handleInvite = async () => {
		if (!email || !emailSchema.safeParse(email).success) {
			toast.error("Please enter a valid email address.");
			return;
		}

		try {
			setLoading(true);
			const { error } = await authClient.organization.inviteMember({
				email: email,
				role: role,
				resend: true,
			});

			if (error) {
				toast.error(error.message);
				return;
			}

			await refetch();
			toast.success(`Successfully sent invitation to ${email}`);
			setEmail("");
			setRole("developer");
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
			<PopoverContent align="end" className="flex flex-col gap-2">
				<div className="flex items-center gap-1 text-t3">
					<Mail size={12} />
					<p className="text-t3 text-sm">Invite by email</p>
				</div>

				{/*
				  Password managers (especially Bitwarden) aggressively autofill
				  any visible email-looking input with the current user's own
				  credentials — which is exactly wrong for an invite form.

				  We defeat autofill with a layered approach:

				    1. A throwaway hidden dummy input with `type="email"` placed
				       ABOVE the real field. Password managers typically fill the
				       first email-shaped field they encounter; sending them
				       into an `aria-hidden`/tab-index=-1 sink absorbs the
				       hit and leaves the real field untouched.

				    2. Randomised `name` (per-session) so manager heuristics
				       can't memoise "fill this orgname's invite box".

				    3. `autoComplete="off"` + Bitwarden/1P/LastPass/Dashlane
				       opt-out data-attrs.

				    4. `inputMode="email"` keeps the mobile keyboard correct
				       without the field declaring `type="email"` (which is what
				       triggers autofill in the first place).
				*/}
				<input
					type="email"
					name="dummy-email-sink"
					tabIndex={-1}
					aria-hidden="true"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						opacity: 0,
						height: 0,
						width: 0,
						pointerEvents: "none",
					}}
				/>

				<div className="flex items-center gap-2">
					<Input
						className="h-7"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						// Multi-vendor autofill opt-out. `data-bwignore` is the
						// attribute Bitwarden's content script actually checks
						// (not `data-bw-ignore`). `data-form-type="other"`
						// opts out of Dashlane.
						autoComplete="off"
						name={`invitee-${Math.random().toString(36).slice(2, 10)}`}
						type="text"
						inputMode="email"
						spellCheck={false}
						data-1p-ignore
						data-lpignore="true"
						data-bwignore="true"
						data-form-type="other"
					/>
					<Button
						variant="primary"
						className="h-6.5! mt-0!"
						onClick={handleInvite}
						isLoading={loading}
					>
						Send
					</Button>
				</div>

				<RoleSelect
					value={role}
					onChange={setRole}
					allowed={INVITE_ROLES}
					className="h-7 w-full"
				/>
			</PopoverContent>
		</Popover>
	);
};
