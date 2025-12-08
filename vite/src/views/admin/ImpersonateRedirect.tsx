import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "../../services/useAxiosInstance";
import { useAdmin } from "./hooks/useAdmin";


export function ImpersonateRedirect() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
  const { isAdmin } = useAdmin();
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
				const { data} = await axiosInstance.get(`/admin/org-member?org_id=${orgId}`);
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



				// Use window.location for a full page reload to ensure session is picked up
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
	}, [orgId, redirect, navigate, isAdmin]);

  if (!isAdmin) {
    navigate("/");
  }

	return (
		<div className="min-h-screen flex items-center justify-center bg-zinc-950">
			<div className="text-center">
				{error ? (
					<div className="text-red-400">
						<p className="text-lg font-medium">Error</p>
						<p className="text-sm mt-2">{error}</p>
						<button
							type="button"
							onClick={() => { window.location.href = redirect }}
							className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded hover:bg-zinc-700"
						>
							Continue anyway
						</button>
					</div>
				) : (
					<div className="text-zinc-400">
						<div className="animate-spin size-8 border-2 border-zinc-600 border-t-white rounded-full mx-auto mb-4" />
						<p className="text-sm">{status}</p>
					</div>
				)}
			</div>
		</div>
	);
}
