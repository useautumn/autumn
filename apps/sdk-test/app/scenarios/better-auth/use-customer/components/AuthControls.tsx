"use client";

import { useState } from "react";
import { DebugCard } from "@/components/debug/DebugCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth-client";

export function AuthControls({
  onError,
  onSignOut,
}: {
  onError: (error: unknown) => void;
  onSignOut: () => void;
}) {
  const { data: session, isPending: sessionLoading } = useSession();

  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("password123");
  const [name, setName] = useState("Test User");

  const handleSignUp = async () => {
    const result = await authClient.signUp.email({ email, password, name });
    if (result.error) onError(result.error);
  };

  const handleSignIn = async () => {
    const result = await authClient.signIn.email({ email, password });
    if (result.error) onError(result.error);
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    onSignOut();
  };

  const handleDeleteUser = async () => {
    if (!session?.user?.id) return;
    if (!confirm("Delete this user? This cannot be undone.")) return;
    try {
      const response = await fetch(
        `/api/auth/delete-user?id=${session.user.id}`,
        { method: "DELETE" },
      );
      if (response.ok) {
        await authClient.signOut();
        onSignOut();
      } else {
        onError(await response.json());
      }
    } catch (err) {
      onError(err);
    }
  };

  return (
    <DebugCard title="Auth Controls">
      {sessionLoading ? (
        <p className="text-sm text-zinc-500">Loading session...</p>
      ) : session ? (
        <div className="space-y-3">
          <p className="text-sm">
            Signed in as{" "}
            <span className="font-medium">{session.user.email}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteUser}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              Delete User
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSignUp}>
              Sign Up
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignIn}>
              Sign In
            </Button>
          </div>
        </div>
      )}
    </DebugCard>
  );
}
