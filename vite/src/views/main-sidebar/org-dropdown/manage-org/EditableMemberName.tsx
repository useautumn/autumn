import { InlineEdit } from "@/components/general/InlineEdit";
import { useUserService } from "@/services/userService";
import { useSession } from "@/lib/auth-client";
import { Membership } from "@autumn/shared";

interface EditableMemberNameProps {
  membership: Membership;
  onUpdate?: (updatedUser: any) => void;
}

export const EditableMemberName = ({ 
  membership, 
  onUpdate 
}: EditableMemberNameProps) => {
  const { data: session } = useSession();
  const { updateUserProfile } = useUserService();

  const canEdit = () => {
    const currentUserId = session?.session?.userId;
    const memberUserId = membership.user.id;
    const memberRole = membership.member.role;
    
    if (currentUserId === memberUserId) {
      return true;
    }
    
    if (memberRole === "admin" || memberRole === "owner") {
      return true;
    }
    
    return false;
  };

  const validateName = (name: string): string | null => {
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      return "Name can only contain letters, numbers, spaces, hyphens, and underscores";
    }
    return null;
  };

  const handleSave = async (newName: string) => {
    try {
      const updatedUser = await updateUserProfile(newName);
      onUpdate?.(updatedUser);
    } catch (error) {
      throw error;
    }
  };

  return (
    <InlineEdit
      value={membership.user.name}
      onSave={handleSave}
      placeholder="Enter name..."
      disabled={!canEdit()}
      validation={validateName}
      maxLength={50}
      minLength={3}
      className="w-full"
    />
  );
};
