import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { Input } from "@/components/v2/inputs/Input";
import { TagInput } from "@/components/v2/inputs/TagInput";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";

interface CreateOAuthClientDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess: () => void;
}

interface CreatedClient {
	clientId: string;
	clientSecret?: string;
	name?: string;
}

export const CreateOAuthClientDialog = ({
	open,
	onOpenChange,
	onSuccess,
}: CreateOAuthClientDialogProps) => {
	const [step, setStep] = useState<"form" | "success">("form");
	const [isLoading, setIsLoading] = useState(false);
	const [showSecret, setShowSecret] = useState(false);
	const [createdClient, setCreatedClient] = useState<CreatedClient | null>(null);

	const [formData, setFormData] = useState({
		name: "",
		redirectUris: "",
		isPublic: true, // Default to public for CLI usage
		skipConsent: false,
		scopes: ["openid", "profile", "email"],
	});

	const resetForm = () => {
		setFormData({
			name: "",
			redirectUris: "",
			isPublic: true,
			skipConsent: false,
			scopes: ["openid", "profile", "email"],
		});
		setStep("form");
		setCreatedClient(null);
		setShowSecret(false);
	};

	const handleClose = () => {
		resetForm();
		onOpenChange(false);
	};

	const handleSubmit = async () => {
		if (!formData.name.trim()) {
			toast.error("Please enter a client name");
			return;
		}

		if (!formData.redirectUris.trim()) {
			toast.error("Please enter at least one redirect URI");
			return;
		}

		const redirectUris = formData.redirectUris
			.split("\n")
			.map((uri) => uri.trim())
			.filter((uri) => uri.length > 0);

		if (redirectUris.length === 0) {
			toast.error("Please enter at least one valid redirect URI");
			return;
		}

		setIsLoading(true);
		try {
			const { data, error } = await authClient.oauth2.createClient({
				client_name: formData.name,
				redirect_uris: redirectUris,
				token_endpoint_auth_method: formData.isPublic ? "none" : "client_secret_basic",
				scope: formData.scopes.join(" "),
			});

			if (error) {
				toast.error(error.message || "Failed to create OAuth client");
				return;
			}

			if (data) {
				setCreatedClient({
					clientId: data.client_id,
					clientSecret: data.client_secret,
					name: formData.name,
				});
				setStep("success");
				toast.success("OAuth client created successfully");
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create OAuth client"));
		} finally {
			setIsLoading(false);
		}
	};

	const handleCopy = (text: string, label: string) => {
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied to clipboard`);
	};

	const handleDone = () => {
		onSuccess();
		resetForm();
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-lg">
				{step === "form" ? (
					<>
						<DialogHeader>
							<DialogTitle>Create OAuth Client</DialogTitle>
							<DialogDescription>
								Create a new OAuth 2.1 client for external applications
							</DialogDescription>
						</DialogHeader>

						<div className="flex flex-col gap-4 py-2">
							{/* Client Name */}
							<div className="flex flex-col gap-1.5">
								<span className="text-sm font-medium text-foreground">
									Client Name
								</span>
								<Input
									value={formData.name}
									onChange={(e) =>
										setFormData({ ...formData, name: e.target.value })
									}
									placeholder="My CLI Tool"
								/>
								<p className="text-xs text-muted-foreground">
									A friendly name shown to users during authorization
								</p>
							</div>

							{/* Client Type */}
							<div className="flex flex-col gap-2">
								<span className="text-sm font-medium text-foreground">
									Client Type
								</span>
								<div className="flex gap-2">
									<button
										type="button"
										onClick={() => setFormData({ ...formData, isPublic: true })}
										className={cn(
											"flex-1 px-3 py-2 rounded-lg border text-sm text-left transition-colors cursor-pointer",
											formData.isPublic
												? "border-primary bg-primary/5"
												: "border-border hover:border-primary/50",
										)}
									>
										<div className="font-medium">Public</div>
										<div className="text-xs text-muted-foreground mt-0.5">
											For CLI tools, mobile apps, SPAs
										</div>
									</button>
									<button
										type="button"
										onClick={() => setFormData({ ...formData, isPublic: false })}
										className={cn(
											"flex-1 px-3 py-2 rounded-lg border text-sm text-left transition-colors cursor-pointer",
											!formData.isPublic
												? "border-primary bg-primary/5"
												: "border-border hover:border-primary/50",
										)}
									>
										<div className="font-medium">Confidential</div>
										<div className="text-xs text-muted-foreground mt-0.5">
											For server-side apps with secrets
										</div>
									</button>
								</div>
							</div>

							{/* Redirect URIs */}
							<div className="flex flex-col gap-1.5">
								<span className="text-sm font-medium text-foreground">
									Redirect URIs
								</span>
								<textarea
									value={formData.redirectUris}
									onChange={(e) =>
										setFormData({ ...formData, redirectUris: e.target.value })
									}
									placeholder="http://localhost:8787/callback&#10;http://127.0.0.1:8787/callback"
									rows={3}
									className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
								/>
								<p className="text-xs text-muted-foreground">
									One URI per line. For CLI tools, use localhost callbacks.
								</p>
							</div>

							{/* Scopes */}
							<div className="flex flex-col gap-1.5">
								<span className="text-sm font-medium text-foreground">
									Allowed Scopes
								</span>
								<TagInput
									value={formData.scopes}
									onChange={(scopes) =>
										setFormData({ ...formData, scopes })
									}
									placeholder="Add scope..."
								/>
								<p className="text-xs text-muted-foreground">
									Press space or enter to add a scope
								</p>
							</div>

							{/* Skip Consent */}
							<div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
								<Checkbox
									checked={formData.skipConsent}
									onCheckedChange={(checked) =>
										setFormData({ ...formData, skipConsent: checked === true })
									}
									size="md"
								/>
								<div className="flex-1 -mt-0.5">
									<span className="text-sm font-medium text-foreground cursor-pointer leading-none">
										Skip consent screen
									</span>
									<p className="text-xs text-muted-foreground mt-1">
										Enable for trusted first-party applications only
									</p>
								</div>
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
								Create Client
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Client Created Successfully</DialogTitle>
							<DialogDescription>
								{createdClient?.clientSecret
									? "Save these credentials now - the client secret won't be shown again!"
									: "Here are your client credentials"}
							</DialogDescription>
						</DialogHeader>

						<div className="flex flex-col gap-4 py-2">
							{/* Client ID */}
							<div className="flex flex-col gap-1.5">
								<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
									Client ID
								</span>
								<div className="flex items-center gap-2">
									<code className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg font-mono break-all">
										{createdClient?.clientId}
									</code>
									<Button
										variant="secondary"
										size="icon"
										onClick={() =>
											handleCopy(createdClient?.clientId || "", "Client ID")
										}
									>
										<Copy className="w-4 h-4" />
									</Button>
								</div>
							</div>

							{/* Client Secret (only for confidential clients) */}
							{createdClient?.clientSecret && (
								<div className="flex flex-col gap-1.5">
									<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
										Client Secret
									</span>
									<div className="flex items-center gap-2">
										<code className="flex-1 px-3 py-2 text-sm bg-muted rounded-lg font-mono break-all">
											{showSecret
												? createdClient.clientSecret
												: "•".repeat(32)}
										</code>
										<Button
											variant="secondary"
											size="icon"
											onClick={() => setShowSecret(!showSecret)}
										>
											{showSecret ? (
												<EyeOff className="w-4 h-4" />
											) : (
												<Eye className="w-4 h-4" />
											)}
										</Button>
										<Button
											variant="secondary"
											size="icon"
											onClick={() =>
												handleCopy(
													createdClient?.clientSecret || "",
													"Client Secret",
												)
											}
										>
											<Copy className="w-4 h-4" />
										</Button>
									</div>
									<p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
										This secret will only be shown once. Please save it securely!
									</p>
								</div>
							)}
						</div>

						<DialogFooter>
							<Button variant="primary" onClick={handleDone}>
								Done
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
