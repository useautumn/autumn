import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { X, Check, UserPlus } from "lucide-react";
import { FullInvite } from "@autumn/shared";
import { useInvitesQuery } from "@/hooks/queries/useInvitesQuery";
import { authClient } from "@/lib/auth-client";
import { AnimatePresence } from "motion/react";
import { motion } from "motion/react";

export const InviteNotifications = () => {
  const [loading, setLoading] = useState(false);
  const { invites, refetch } = useInvitesQuery();

  const handleRespondToRequest = async (
    invite: FullInvite,
    action: "accept" | "reject"
  ) => {
    try {
      setLoading(true);

      if (action === "accept") {
        await authClient.organization.acceptInvitation({
          invitationId: invite.id,
        });

        // Switch to that org
        await authClient.organization.setActive({
          organizationId: invite.organization.id,
        });

        toast.success(`Invitation accepted successfully`);
        window.location.reload();
      } else {
        await authClient.organization.rejectInvitation({
          invitationId: invite.id,
        });
        toast.success(`Invitation rejected successfully`);
      }
      await refetch();
    } catch (error) {
      toast.error(getBackendErr(error, `Failed to ${action} invitation`));
    } finally {
      setLoading(false);
    }
  };

  if (invites.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-50 space-y-3 max-w-md">
      <AnimatePresence mode="popLayout">
        {invites.map((invite: FullInvite, index) => (
          <motion.div
            key={invite.id}
            initial={{
              opacity: 0,
              scale: 0.8,
              y: -50,
              x: 100,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              x: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.8,
              x: 100,
              transition: { duration: 0.2 },
            }}
            transition={{
              type: "spring",
              bounce: 0.3,
              duration: 0.6,
              delay: index * 0.1,
            }}
            layout
          >
            <Card className="border-0 bg-white shadow-xl ring-1 ring-gray-200/50 backdrop-blur-sm">
              <CardHeader className="px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                      <UserPlus size={16} className="text-blue-600" />
                    </motion.div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-gray-900">
                        Organization Invitation
                      </CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4">
                <div className="space-y-4">
                  <div className="rounded-lg bg-gray-50 p-2">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      <span className="font-medium text-gray-900">
                        {invite.inviter.name}
                      </span>{" "}
                      has invited you to join{" "}
                      <span className="font-semibold text-gray-900">
                        {invite.organization.name}
                      </span>{" "}
                      as{" "}
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {invite.role}
                      </span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <motion.div className="flex-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => handleRespondToRequest(invite, "reject")}
                        disabled={loading}
                      >
                        <X size={14} className="mr-2" />
                        Decline
                      </Button>
                    </motion.div>
                    <motion.div className="flex-1">
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleRespondToRequest(invite, "accept")}
                        disabled={loading}
                      >
                        <Check size={14} className="mr-2" />
                        Accept Invitation
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
