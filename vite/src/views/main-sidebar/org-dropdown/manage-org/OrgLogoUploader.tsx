import axios from "axios";
import { ImageIcon } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

const MAX_SIZE_MB = 10;

const OrgLogoUploader: React.FC = () => {
	const { org, mutate } = useOrg();
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const [logoVersion, setLogoVersion] = useState(0);
	const [removing, setRemoving] = useState(false);

	const handleRemove = async () => {
		setRemoving(true);
		try {
			const { error } = await authClient.organization.update({
				data: { logo: "" },
			});
			if (error) {
				toast.error(error.message || "Failed to remove logo");
				return;
			}
			await mutate();
		} catch {
			toast.error("Failed to remove logo");
		} finally {
			setRemoving(false);
		}
	};

	const handleUploadClick = () => {
		inputRef.current?.click();
	};

	const uploadToS3 = async (file: File) => {
		const { data } = await axiosInstance.get("/organization/upload_url");
		const { signedUrl, publicUrl } = data;
		await axios.put(signedUrl, file, {
			headers: { "Content-Type": file.type },
		});

		return publicUrl as string;
	};

	const handleUploading = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		setError(null);
		if (file.size > MAX_SIZE_MB * 1024 * 1024) {
			setError(`File must be under ${MAX_SIZE_MB}MB`);
			return;
		}
		setUploading(true);
		try {
			const publicUrl = await uploadToS3(file);
			const { error } = await authClient.organization.update({
				data: { logo: publicUrl },
			});
			if (error) {
				toast.error(error.message || "Failed to update logo");
				return;
			}
			await mutate();
			setLogoVersion(logoVersion + 1);
			toast.success("Successfully uploaded logo");
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to upload logo"));
		} finally {
			setUploading(false);
		}
	};

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
						src={`${org.logo}?v=${logoVersion}`}
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
				<span className="text-xs text-subtle">1:1, up to {MAX_SIZE_MB}MB</span>
			</div>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
	);
};

export default OrgLogoUploader;
