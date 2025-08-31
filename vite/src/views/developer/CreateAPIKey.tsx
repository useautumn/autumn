import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogHeader,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import React, { useEffect, useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useDevContext } from "./DevContext";

const CreateAPIKey = () => {
  const { env, mutate, onboarding, apiKeyName, setApiCreated, apiCreated } =
    useDevContext();
  const axiosInstance = useAxiosInstance({ env });

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setName("");
    setApiKey("");
    setCopied(false);
  }, [open]);

  useEffect(() => {
    if (copied) {
      setTimeout(() => setCopied(false), 1000);
    }
  }, [copied]);

  const handleCreate = async () => {
    const keyName = apiKeyName ? apiKeyName : name;
    
    if (!keyName || keyName.trim() === "") {
      toast.error("Please enter a name for your API key");
      return;
    }

    setLoading(true);
    try {
      const { api_key } = await DevService.createAPIKey(axiosInstance, {
        name: keyName.trim(),
      });

      setApiKey(api_key);
      if (setApiCreated) {
        setApiCreated(true);
      }
      await mutate();
    } catch (error: any) {
      console.log("Error:", error);
      if (error?.response?.data?.code === "duplicate_api_key_name") {
        toast.error(error.response.data.message || "API key with this name already exists");
      } else {
        toast.error("Failed to create API key");
      }
    }

    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={`${onboarding ? "w-fit" : ""}`}
          variant={onboarding ? "gradientPrimary" : "add"}
          disabled={apiCreated ? true : false}
          onClick={() => {
            if (apiKeyName) {
              handleCreate();
            }
          }}
        >
          Secret Key
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create Secret API Key</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-y-4">
          {apiKey ? (
            <>
              <p className="text-sm text-t3 font-medium">
                Please copy your API Key and keep it somewhere safe. You
                won&apos;t be able to view it anymore after this
              </p>
              <div className="flex justify-between bg-zinc-100 p-2 px-3 text-t2 rounded-md items-center">
                <p className="text-sm">{apiKey}</p>
                <button
                  className="text-t2 hover:text-t2/80"
                  onClick={() => {
                    setCopied(true);
                    navigator.clipboard.writeText(apiKey);
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </>
          ) : (
            <div>
              <p className="mb-2 text-sm text-t3">Name</p>
              <Input
                placeholder="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {apiKey ? (
            <Button onClick={() => setOpen(false)}>Close</Button>
          ) : (
            <Button
              isLoading={loading}
              onClick={handleCreate}
              variant="gradientPrimary"
            >
              Create
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAPIKey;
