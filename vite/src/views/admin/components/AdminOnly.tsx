import React from "react";
import { useAdmin } from "../hooks/useAdmin";

export const AdminOnly = ({ children }: { children: React.ReactNode }) => {
	const { isAdmin, isPending } = useAdmin();

	if (!isAdmin) {
		return null;
	}

	return <React.Fragment>{children}</React.Fragment>;
};
