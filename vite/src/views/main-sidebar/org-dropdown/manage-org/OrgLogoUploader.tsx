import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import axios from "axios";
import { useOrg } from "@/hooks/useOrg";
import { getOrgLogoUrl } from "@/utils/orgUtils";
import { getBackendErr } from "@/utils/genUtils";

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export interface OrgLogoUploaderProps {
  initialLogoUrl?: string;
}

const OrgLogoUploader: React.FC<OrgLogoUploaderProps> = ({
  initialLogoUrl,
}) => {
  const { org, mutate } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const [logoVersion, setLogoVersion] = useState(0);

  const [removing, setRemoving] = useState(false);

  // Removal logic
  const handleRemove = async () => {
    setRemoving(true);
    try {
      const { error } = await authClient.organization.update({
        data: {
          logo: "",
        },
      });

      if (error) {
        toast.error(error.message || "Failed to remove logo");
        return;
      }

      await mutate();
      setRemoving(false);
    } catch (error) {
      setRemoving(false);
    }
  };

  // Upload logic
  const handleUploadClick = () => {
    inputRef.current?.click();
  };

  const uploadToSupabase = async (file: File) => {
    const { data } = await axiosInstance.get("/organization/upload_url");
    const { signedUrl } = data;

    await axios.put(signedUrl, file, {
      headers: {
        "Content-Type": file.type,
      },
    });
  };

  const handleUploading = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    setUploading(true);
    try {
      await uploadToSupabase(file);

      const { error } = await authClient.organization.update({
        data: {
          logo: getOrgLogoUrl(org.id),
        },
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
    <div className="flex flex-col items-start">
      <FieldLabel>Logo</FieldLabel>
      <div className="flex items-center gap-4 rounded bg-gray-50 w-full max-w-xs">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleUploading}
        />
        {org.logo ? (
          <img
            src={org.logo + "?v=" + logoVersion}
            alt="Org Logo Preview"
            className="w-16 h-16 rounded object-cover border"
          />
        ) : (
          <div className="w-16 h-16 rounded bg-stone-100 flex items-center justify-center text-stone-400 border">
            <span className="text-2xl">+</span>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 items-center">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleUploadClick}
              className="shadow-none"
              shimmer={uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            {org.logo && (
              <Button
                variant="ghost"
                className="text-red-500 hover:text-red-600"
                size="sm"
                onClick={handleRemove}
                shimmer={removing}
              >
                Remove
              </Button>
            )}
          </div>
          <span className="text-xs text-gray-500">
            Recommended size 1:1, up to 10MB.
          </span>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </div>
    </div>
  );
};

export default OrgLogoUploader;
