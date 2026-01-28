import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { TagInput } from "@/components/v2/inputs/TagInput";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";

interface OAuthClient {
	client_id: string;
	client_name?: string;
	redirect_uris?: string[];
	public?: boolean;
	disabled?: boolean;
	skip_consent?: boolean;
	scope?: string;
}

interface EditOAuthClientDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
	client: OAuthClient | null;
}

export const EditOAuthClientDialog = ({
	open,
	onOpenChange,
	onSuccess,
	client,
}: EditOAuthClientDialogProps) => {
	const [isLoading, setIsLoading] = useState(false);
	const [scopes, setScopes] = useState<string[]>([]);
	const [redirectUris, setRedirectUris] = useState("");

	useEffect(() => {
		if (client?.scope) {
			setScopes(client.scope.split(" ").filter(Boolean));
		} else {
			setScopes([]);
		}
		if (client?.redirect_uris) {
			setRedirectUris(client.redirect_uris.join("\n"));
		} else {
			setRedirectUris("");
		}
	}, [client]);

	const handleClose = () => {
		onOpenChange(false);
	};

	const handleSubmit = async () => {
		if (!client) return;

		// Parse redirect URIs
		const parsedRedirectUris = redirectUris
			.split("\n")
			.map((uri) => uri.trim())
			.filter((uri) => uri.length > 0);

		if (parsedRedirectUris.length === 0) {
			toast.error("Please enter at least one redirect URI");
			return;
		}

		setIsLoading(true);
		try {
			const { error } = await authClient.oauth2.updateClient({
				client_id: client.client_id,
				update: {
					scope: scopes.join(" "),
					redirect_uris: parsedRedirectUris,
				},
			});

			if (error) {
				toast.error(error.message || "Failed to update OAuth client");
				return;
			}

			toast.success("OAuth client updated successfully");
			onSuccess();
			handleClose();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update OAuth client"));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>Edit OAuth Client</DialogTitle>
					<DialogDescription>
						Update settings for {client?.client_name || "this client"}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					{/* Redirect URIs */}
					<div className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-foreground">
							Redirect URIs
						</span>
						<Textarea
							value={redirectUris}
							onChange={(e) => setRedirectUris(e.target.value)}
							placeholder="http://localhost:3000/callback"
							rows={4}
						/>
						<p className="text-xs text-muted-foreground">
							One URI per line. These are the allowed callback URLs.
						</p>
					</div>

					{/* Scopes */}
					<div className="flex flex-col gap-1.5">
						<span className="text-sm font-medium text-foreground">
							Allowed Scopes
						</span>
						<TagInput
							value={scopes}
							onChange={setScopes}
							placeholder="Add scope..."
						/>
						<p className="text-xs text-muted-foreground">
							Press space or enter to add a scope
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button variant="secondary" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						variant="primary"
						onClick={handleSubmit}
						isLoading={isLoading}
					>
						Save Changes
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
