import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { Mail, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMemberships } from "../hooks/useMemberships";

export const InvitePopover = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const { mutate } = useMemberships();
  const [open, setOpen] = useState(false);

  const handleInvite = async () => {
    try {
      setLoading(true);
      const { data, status } = await axiosInstance.post(
        "/organization/invite",
        {
          email: email,
          role: "member",
        },
      );

      if (status === 202) {
        await authClient.organization.inviteMember({
          email: email,
          role: "admin",
        });
        toast.success(`Successfully sent invitation to ${email}`);
      } else {
        toast.success(data.message);
      }
      await mutate();
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, "Failed to invite user"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="add">Invite</Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="border border-border bg-background text-foreground flex flex-col gap-2 pt-3"
      >
        <div className="flex items-center gap-1">
          <Mail size={12} className="text-muted-foreground" />
          <p className="text-foreground text-sm">Invite by email</p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            className="h-7"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            variant="gradientPrimary"
            className="!h-6.5 !mt-0"
            startIcon={<PlusIcon size={10} />}
            onClick={handleInvite}
            isLoading={loading}
          >
            Add
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
