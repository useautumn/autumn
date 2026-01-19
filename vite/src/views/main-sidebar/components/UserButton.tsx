import { useSession, signOut, deleteUser } from "@/lib/auth-client";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export const UserButton = () => {
	const navigate = useNavigate();
	const { data: session } = useSession();
	const user = session?.user;
	const [isLoading, setIsLoading] = useState(false);

	if (!user) return null;

	const handleSignOut = async () => {
		setIsLoading(true);
		try {
			await signOut();
		} catch (error) {
			console.error("Sign out failed:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteAccount = async () => {
		await deleteUser();
	};

	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((part) => part[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	};

	const displayName = user.name || user.email?.split("@")[0] || "User";
	const initials = getInitials(displayName);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className="relative flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white text-sm font-medium overflow-hidden group transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20">
					{/* Shimmer effect */}
					<div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
						<div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-400 ease-out" />
					</div>

					{/* Avatar content */}
					{user.image ? (
						<img
							src={user.image}
							alt={displayName}
							className="w-full h-full object-cover rounded-full"
						/>
					) : (
						<span className="relative z-10">{initials}</span>
					)}
				</button>
			</DropdownMenuTrigger>

			<DropdownMenuContent
				align="end"
				className="ml-3 flex flex-col gap-1 min-w-40"
				sideOffset={12}
			>
				<DropdownMenuItem
					onClick={() => navigate("/settings")}
					className="cursor-pointer flex items-center gap-2 text-sm rounded-sm text-t2"
				>
					<Settings size={10} />
					<span>Organization Settings</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={handleSignOut}
					disabled={isLoading}
					className="cursor-pointer flex items-center gap-2 text-sm rounded-sm text-t2"
				>
					<LogOut size={10} />
					<span>{isLoading ? "Signing out..." : "Sign out"}</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleDeleteAccount}
					disabled={isLoading}
					className="cursor-pointer flex items-center gap-2 text-sm rounded-sm text-t2"
				>
					<span>Delete Account</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
