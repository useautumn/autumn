import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { Mail, PlusIcon, UserCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMemberships } from "../hooks/useMemberships";
import { OrgRole, ROLE_DISPLAY_NAMES } from "@autumn/shared";
import { useSession } from "@/lib/auth-client";

export const InvitePopover = () => {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(OrgRole.Member);
  const [loading, setLoading] = useState(false);
  const axiosInstance = useAxiosInstance();
  const { mutate } = useMemberships();
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const { memberships } = useMemberships();

  // Get current user's role to determine what roles they can assign
  const currentUserMembership = memberships.find(
    (membership) => membership.user.id === session?.session?.userId
  );
  const currentUserRole = currentUserMembership?.member.role as OrgRole;

  // Filter available roles based on current user's permissions
  const getAvailableRoles = () => {
    const roles = Object.values(OrgRole);
    
    if (currentUserRole === OrgRole.Owner) {
      return roles; // Owner can assign any role
    } else if (currentUserRole === OrgRole.Admin) {
      return roles.filter(r => r !== OrgRole.Owner); // Admin can't assign owner
    } else {
      return []; // Members can't invite anyone
    }
  };

  const availableRoles = getAvailableRoles();

  const handleInvite = async () => {
    if (!email.trim()) {
      toast.error("Please enter an email address");
      return;
    }

    if (availableRoles.length === 0) {
      toast.error("You don't have permission to invite members");
      return;
    }

    try {
      setLoading(true);
      const { data, status } = await axiosInstance.post(
        "/organization/invite",
        {
          email: email.trim(),
          role: role,
        },
      );

      if (status === 200 || status === 202) {
        toast.success(`Successfully sent invitation to ${email}`);
        await mutate();
        setOpen(false);
        setEmail("");
        setRole(OrgRole.Member);
      } else {
        toast.error("Failed to send invitation");
      }
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, "Failed to invite user"));
    } finally {
      setLoading(false);
    }
  };

  // Don't show invite button if user can't invite
  if (availableRoles.length === 0) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="add">Invite</Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-4 bg-white border border-gray-200 rounded-lg shadow-lg"
        style={{ zIndex: 1000 }}
      >
        <div className="space-y-3">
          {/* Email Input */}
          <div>
            <Input
              className="h-8 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Role Selection */}
          <div>
            <Select value={role} onValueChange={(value) => setRole(value as OrgRole)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent 
                className="z-[1001] min-w-[120px]"
                position="popper"
                side="bottom"
                align="start"
              >
                {availableRoles.map((availableRole) => (
                  <SelectItem 
                    key={availableRole} 
                    value={availableRole}
                    className="text-sm py-1.5"
                  >
                    {ROLE_DISPLAY_NAMES[availableRole]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleInvite}
            isLoading={loading}
            disabled={!email.trim()}
            className="w-full h-8 text-sm"
          >
            Send
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
