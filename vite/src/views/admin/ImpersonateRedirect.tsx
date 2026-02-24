import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/v2/buttons/Button";
import { clearOrgCache } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "../../services/useAxiosInstance";
import { useAdmin } from "./hooks/useAdmin";

export function ImpersonateRedirect() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { isAdmin, isPending } = useAdmin();
	const [status, setStatus] = useState("Impersonating...");
	const [error, setError] = useState<string | null>(null);

	const axiosInstance = useAxiosInstance();

	const orgId = searchParams.get("org_id");
	const redirect = searchParams.get("redirect") || "/";

	useEffect(() => {
		const doImpersonate = async () => {
			if (!orgId) {
				setError("org_id is required");
				return;
			}

			try {
				// Step 1: Get a user ID for this org from the API
				setStatus("Finding org member...");
				const { data } = await axiosInstance.get(
					`/admin/org-member?org_id=${orgId}`,
				);
				console.log("Data:", data);
				if (!data.userId) {
					setError("No member found for this org");
					return;
				}

				// Step 2: Stop any existing impersonation
				setStatus("Stopping existing impersonation...");
				try {
					await authClient.admin.stopImpersonating();
				} catch {
					// Ignore - might not be impersonating
				}

				// Step 3: Impersonate the user
				setStatus("Impersonating user...");
				const impersonateResult = await authClient.admin.impersonateUser({
					userId: data.userId,
				});

				if (impersonateResult.error) {
					setError(`Failed to impersonate: ${impersonateResult.error.message}`);
					return;
				}

				// Step 4: Set the active organization
				setStatus("Setting active organization...");
				await authClient.organization.setActive({
					organizationId: orgId,
				});

				// Step 5: Navigate to the redirect path
				setStatus("Redirecting...");

				// Clear stale org cache before navigating so the new session loads fresh data
				clearOrgCache();
				window.location.href = redirect;
			} catch (err: unknown) {
				const errorMessage =
					err instanceof Error ? err.message : "Unknown error";
				setError(`Error: ${errorMessage}`);
			}
		};

		if (isAdmin) {
			doImpersonate();
		}
	}, [orgId, redirect, navigate, isAdmin, isPending]);

	if (!isAdmin && isPending) {
		navigate("/");
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<div className="max-w-md w-full mx-4">
				<div className="border border-border rounded-xl bg-card p-8 shadow-lg">
					{error ? (
						<div className="text-center">
							<div className="flex justify-center mb-4">
								<div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
									<AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
								</div>
							</div>
							<h2 className="text-lg font-semibold text-t1 mb-2">
								Impersonation Failed
							</h2>
							<p className="text-sm text-t3 mb-6">{error}</p>
							<Button
								variant="primary"
								onClick={() => {
									window.location.href = redirect;
								}}
								className="w-full"
							>
								Continue Anyway
							</Button>
						</div>
					) : (
						<div className="text-center">
							<div className="flex justify-center mb-4">
								<div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-3">
									<ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
								</div>
							</div>
							<h2 className="text-lg font-semibold text-t1 mb-2">
								Admin Impersonation
							</h2>
							<div className="flex items-center justify-center gap-2 text-sm text-t3 mb-4">
								<Loader2 className="w-4 h-4 animate-spin" />
								<span>{status}</span>
							</div>
							<div className="bg-muted/50 rounded-lg p-3 mt-4">
								<p className="text-xs text-t4">
									Switching to organization context...
								</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
