import { KeyRound, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { authClient } from "@/lib/auth-client";
import { getBackendErr } from "@/utils/genUtils";

type Passkey = {
	id: string;
	name: string | null;
	createdAt: string | Date | null;
};

const formatDate = (value: string | Date | null | undefined) => {
	if (!value) return "";
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
};

export const PasskeysSection = () => {
	const [passkeys, setPasskeys] = useState<Passkey[]>([]);
	const [loading, setLoading] = useState(true);
	const [name, setName] = useState("");
	const [adding, setAdding] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const refetch = useCallback(async () => {
		try {
			setLoading(true);
			const { data, error } = await authClient.passkey.listUserPasskeys();
			if (error) {
				toast.error(error.message || "Failed to load passkeys");
				setPasskeys([]);
				return;
			}
			setPasskeys((data as Passkey[] | null) ?? []);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to load passkeys"));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refetch();
	}, [refetch]);

	const handleAdd = async () => {
		setAdding(true);
		try {
			const result = await authClient.passkey.addPasskey({
				name: name.trim() || undefined,
			});
			if (result && "error" in result && result.error) {
				toast.error(result.error.message || "Failed to add passkey");
				return;
			}
			toast.success("Passkey added");
			setName("");
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to add passkey"));
		} finally {
			setAdding(false);
		}
	};

	const handleDelete = async (id: string) => {
		setDeletingId(id);
		try {
			const { error } = await authClient.passkey.deletePasskey({ id });
			if (error) {
				toast.error(error.message || "Failed to delete passkey");
				return;
			}
			toast.success("Passkey removed");
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to delete passkey"));
		} finally {
			setDeletingId(null);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1">
				<h3 className="text-sm font-medium text-t1">Passkeys</h3>
				<p className="text-xs text-t3">
					Passwordless sign-in using biometrics, a PIN, or a security key.
				</p>
			</div>

			<div className="border border-border rounded-xl bg-card overflow-hidden">
				<div className="divide-y divide-border">
					{loading ? (
						<div className="px-4 py-8 text-center text-sm text-t3">
							<span className="shimmer">Loading passkeys...</span>
						</div>
					) : passkeys.length === 0 ? (
						<div className="px-4 py-8 text-center">
							<KeyRound className="w-6 h-6 mx-auto mb-2 text-t4" />
							<p className="text-sm text-t3">No passkeys yet</p>
							<p className="text-xs text-t4 mt-1">
								Add one below to sign in without a password.
							</p>
						</div>
					) : (
						passkeys.map((pk) => (
							<div
								key={pk.id}
								className="px-4 py-3 flex items-center justify-between gap-4"
							>
								<div className="flex items-center gap-3 min-w-0">
									<KeyRound className="w-4 h-4 text-t3 shrink-0" />
									<div className="flex flex-col min-w-0">
										<span className="text-sm text-t1 truncate">
											{pk.name || "Unnamed passkey"}
										</span>
										{pk.createdAt && (
											<span className="text-xs text-t3">
												Added on {formatDate(pk.createdAt)}
											</span>
										)}
									</div>
								</div>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => handleDelete(pk.id)}
									isLoading={deletingId === pk.id}
									className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</Button>
							</div>
						))
					)}
				</div>

				<div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center gap-2">
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Passkey name (optional)"
						className="flex-1"
						onKeyDown={(e) => {
							if (e.key === "Enter") void handleAdd();
						}}
					/>
					<Button
						variant="secondary"
						onClick={handleAdd}
						isLoading={adding}
						className="shrink-0"
					>
						Add passkey
					</Button>
				</div>
			</div>
		</div>
	);
};
