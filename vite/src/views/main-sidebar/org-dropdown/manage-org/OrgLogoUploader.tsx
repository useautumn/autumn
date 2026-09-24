import { Button, FormLabel } from "@autumn/ui";
import axios from "axios";
import { ImageIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { FetchLogoPopover } from "./FetchLogoPopover";

const MAX_SIZE_MB = 10;

const isEditableTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target.isContentEditable);

const OrgLogoUploader: React.FC = () => {
	const { org, mutate } = useOrg();
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const [removing, setRemoving] = useState(false);

	const handleRemove = async () => {
		setRemoving(true);
		try {
			// Clear the DB reference first — the org row is what the UI renders.
			// Only then delete the S3 object, as best-effort cleanup, so a failed
			// delete can never strand org.logo pointing at a removed object.
			const { error } = await authClient.organization.update({
				data: { logo: "" },
			});
			if (error) {
				toast.error(error.message || "Failed to remove logo");
				return;
			}
			await mutate();

			try {
				await axiosInstance.delete("/organization/logo");
			} catch {
				// Orphaned object is harmless and DeleteObject is idempotent, so a
				// later removal retries it. The logo is already gone for the user.
			}
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to remove logo"));
		} finally {
			setRemoving(false);
		}
	};

	const handleUploadClick = () => {
		inputRef.current?.click();
	};

	const uploadToS3 = useCallback(
		async (file: File) => {
			const { data } = await axiosInstance.get("/organization/upload_url");
			const { signedUrl, publicUrl } = data;
			await axios.put(signedUrl, file, {
				headers: { "Content-Type": file.type },
			});

			return publicUrl as string;
		},
		[axiosInstance],
	);

	const saveLogoUrl = useCallback(
		async (publicUrl: string) => {
			// Uploads overwrite the same S3 key, so the URL is byte-identical each
			// time. Store a cache-bust token so every surface that renders org.logo
			// (this preview + the sidebar org selector) repaints the new image.
			const versionedUrl = `${publicUrl}?v=${Date.now()}`;
			const { error } = await authClient.organization.update({
				data: { logo: versionedUrl },
			});
			if (error) {
				toast.error(error.message || "Failed to update logo");
				return;
			}
			await mutate();
			toast.success("Successfully updated logo");
		},
		[mutate],
	);

	const uploadFile = useCallback(
		async (file: File) => {
			setError(null);
			if (file.size > MAX_SIZE_MB * 1024 * 1024) {
				setError(`File must be under ${MAX_SIZE_MB}MB`);
				return;
			}
			setUploading(true);
			try {
				await saveLogoUrl(await uploadToS3(file));
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to upload logo"));
			} finally {
				setUploading(false);
			}
		},
		[saveLogoUrl, uploadToS3],
	);

	const handleUploading = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		// Reset so re-selecting the same file still fires onChange.
		e.target.value = "";
		if (!file) return;
		await uploadFile(file);
	};

	// Pasting an image anywhere on the page sets it as the logo. Pastes into
	// editable fields (e.g. the name/slug inputs) are left alone, even when the
	// clipboard also carries an image.
	useEffect(() => {
		const handlePaste = (e: ClipboardEvent) => {
			if (isEditableTarget(e.target)) return;
			const imageFile = Array.from(e.clipboardData?.files ?? []).find((file) =>
				file.type.startsWith("image/"),
			);
			if (!imageFile || uploading) return;
			e.preventDefault();
			void uploadFile(imageFile);
		};

		document.addEventListener("paste", handlePaste);
		return () => document.removeEventListener("paste", handlePaste);
	}, [uploadFile, uploading]);

	return (
		<div className="flex flex-col gap-1">
			<FormLabel>
				<span className="text-muted-foreground">Logo</span>
			</FormLabel>
			<div className="flex items-center gap-3">
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={handleUploading}
				/>
				{org.logo ? (
					<img
						src={org.logo}
						alt="Organization logo"
						className="w-10 h-10 rounded-md object-cover border border-border"
					/>
				) : (
					<div className="w-10 h-10 rounded-md flex items-center justify-center border border-border border-dashed text-subtle">
						<ImageIcon className="size-4" />
					</div>
				)}
				<div className="flex items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						onClick={handleUploadClick}
						isLoading={uploading}
					>
						Upload
					</Button>
					<FetchLogoPopover onFetched={saveLogoUrl} disabled={uploading} />
					{org.logo && (
						<Button
							variant="secondary"
							size="sm"
							onClick={handleRemove}
							isLoading={removing}
							className="text-destructive"
						>
							Remove
						</Button>
					)}
				</div>
				<span className="text-xs text-subtle">
					1:1, up to {MAX_SIZE_MB}MB · or paste an image
				</span>
			</div>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
	);
};

export default OrgLogoUploader;
