import { RedirectToSignIn, useOrganization, useUser } from "@clerk/clerk-react";
import LoadingScreen from "./general/LoadingScreen";
import { Link, Navigate, useLocation } from "react-router";
import ErrorScreen from "./general/ErrorScreen";

export const DefaultView = () => {
  const { pathname } = useLocation();

  if (pathname == "/") {
    return <Navigate to="/customers" replace={true} />;
  }

  return (
    <ErrorScreen>
      <p className="mb-4">🚩 This page is not found</p>
      <Link className="text-t3 hover:underline" to="/customers">
        Return to dashboard
      </Link>
    </ErrorScreen>
  );

  // By default, will come here
  // 2. if user, redirect to customers
  // return <Navigate to="/customers" replace={true} />;
  // if (!user) {
  //   return <div>Hello World</div>;
  // }
};
