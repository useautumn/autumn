import { useSession } from "@/lib/auth-client";
import LoadingScreen from "../general/LoadingScreen";
import { useNavigate } from "react-router";

export const AcceptInvitation = () => {
  const { data, isPending } = useSession();
  const navigate = useNavigate();

  if (isPending)
    return (
      <div className="w-screen h-screen flex items-center justify-center">
        <LoadingScreen />
      </div>
    );

  if (!data) {
    navigate("/sign-in");
    return;
  }

  return <div>AcceptInvitation!</div>;
};
