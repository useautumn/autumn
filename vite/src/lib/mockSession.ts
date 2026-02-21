import { useQuery } from "@tanstack/react-query";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

/**
 * Fetches the mock session from the server's /api/mock-session endpoint.
 * Used in place of better-auth's useSession when VITE_MOCK_MODE=true.
 */
const fetchMockSession = async () => {
	const res = await fetch(`${BACKEND_URL}/api/mock-session`, {
		credentials: "include",
	});
	if (!res.ok) return null;
	return res.json();
};

/**
 * Drop-in replacement for better-auth's useSession hook.
 * Returns a stable mock user + session so the frontend skips all auth flows.
 */
export const useMockSession = () => {
	const { data, isPending } = useQuery({
		queryKey: ["mock-session"],
		queryFn: fetchMockSession,
		staleTime: Number.POSITIVE_INFINITY,
		retry: 3,
	});

	return { data, isPending };
};
