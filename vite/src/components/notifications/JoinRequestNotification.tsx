import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { X, Check, UserPlus } from "lucide-react";

interface JoinRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  createdAt: string;
  inviterName: string;
  inviterEmail: string;
}

export const JoinRequestNotification = () => {
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const axiosInstance = useAxiosInstance();

  const fetchJoinRequests = async () => {
    try {
      const { data } = await axiosInstance.get("/organization/invitations");
      setJoinRequests(data);
    } catch (error) {
      console.error("Error fetching invitations:", error);
    }
  };

  useEffect(() => {
    fetchJoinRequests();
  }, []);

  const handleRespondToRequest = async (requestId: string, action: "accept" | "reject") => {
    try {
      setLoading(true);
      await axiosInstance.post("/organization/invitations/respond", {
        requestId,
        action,
      });

      toast.success(`Invitation ${action}ed successfully`);
      await fetchJoinRequests(); // Refresh the list
    } catch (error) {
      console.error(error);
      toast.error(getBackendErr(error, `Failed to ${action} invitation`));
    } finally {
      setLoading(false);
    }
  };

  if (joinRequests.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-6 right-6 z-50 space-y-3 max-w-md">
      {joinRequests.map((request) => (
        <Card key={request.id} className="border-0 bg-white shadow-xl backdrop-blur-sm" style={{ border: '1px solid #8231FF20' }}>
          <CardHeader className="pb-3 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: '#8231FF20' }}>
                  <UserPlus size={16} style={{ color: '#8231FF' }} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900">
                    Organization Invitation
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(request.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-sm text-gray-700 leading-relaxed">
                  <span className="font-medium text-gray-900">{request.inviterName}</span>{" "}
                  has invited you to join{" "}
                  <span className="font-semibold text-gray-900">{request.organizationName}</span>{" "}
                  as a{" "}
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: '#8231FF20', color: '#8231FF' }}>
                    {request.role}
                  </span>
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 text-white font-medium shadow-sm transition-all duration-200 hover:shadow-md"
                  style={{ backgroundColor: '#8231FF' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6B1AE8'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#8231FF'}
                  onClick={() => handleRespondToRequest(request.id, "accept")}
                  disabled={loading}
                >
                  <Check size={14} className="mr-2" />
                  Accept Invitation
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 font-medium transition-all duration-200"
                  style={{ 
                    borderColor: '#8231FF', 
                    color: '#8231FF',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#8231FF20';
                    e.currentTarget.style.borderColor = '#6B1AE8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.borderColor = '#8231FF';
                  }}
                  onClick={() => handleRespondToRequest(request.id, "reject")}
                  disabled={loading}
                >
                  <X size={14} className="mr-2" />
                  Decline
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};