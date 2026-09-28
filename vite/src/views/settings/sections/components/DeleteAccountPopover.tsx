import {
	Button,
	Input,
	MiniCopyButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { clearCachedScopes } from "@/hooks/useScopes";
import { useSession } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const DeleteAccountPopover = () => {
	const { data: session } = useSession();
	const email = session?.user?.email ?? "";
	const [confirmText, setConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);
	const axiosInstance = useAxiosInstance();

	const handleDeleteClicked = async () => {
		if (!email || confirmText !== email) {
			toast.error("Please type your email to confirm");
			return;
		}

		setDeleting(true);
		try {
			await axiosInstance.delete("/account");
			clearCachedScopes();
			window.location.href = "/sign-in";
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete account"));
			setDeleting(false);
		}
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="destructive" className="w-24">
					Delete
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end">
				<div className="flex flex-col gap-4 text-sm w-fit">
					<p className="text-tertiary-foreground">
						This permanently deletes your account and every organization where
						you're the only member, including their sandboxes.
					</p>
					<div className="flex items-center gap-1 flex-wrap text-tertiary-foreground">
						<span>Type</span>
						<MiniCopyButton
							text={email}
							innerClassName="font-bold text-foreground"
							iconClassName="opacity-100 text-muted-foreground hover:text-foreground transition-colors"
						/>
						<span>to confirm.</span>
					</div>
					<Input
						variant="destructive"
						placeholder={email}
						value={confirmText}
						onChange={(e) => setConfirmText(e.target.value)}
					/>
					<Button
						variant="destructive"
						className="w-fit"
						isLoading={deleting}
						onClick={handleDeleteClicked}
					>
						Delete account
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
};
