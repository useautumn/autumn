"use client";

import { useState } from "react";
import { DebugCard } from "@/components/debug/DebugCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function OrgControls({
  onError,
}: {
  onError: (error: unknown) => void;
}) {
  const activeOrg = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();

  const [orgName, setOrgName] = useState("Test Org");
  const [orgSlug, setOrgSlug] = useState("test-org");
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const handleCreateOrg = async () => {
    const result = await authClient.organization.create({
      name: orgName,
      slug: orgSlug,
    });
    if (result.error) onError(result.error);
  };

  const handleSetActiveOrg = async () => {
    if (!selectedOrgId) return;
    await authClient.organization.setActive({ organizationId: selectedOrgId });
  };

  const handleClearActiveOrg = async () => {
    await authClient.organization.setActive({ organizationId: null });
  };

  const handleDeleteOrg = async () => {
    if (!selectedOrgId) return;
    if (!confirm("Delete this organization? This cannot be undone.")) return;
    const result = await authClient.organization.delete({
      organizationId: selectedOrgId,
    });
    if (result.error) onError(result.error);
    else setSelectedOrgId("");
  };

  return (
    <DebugCard title="Organization Controls">
      <div className="space-y-4">
        {/* Create Org */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Org Name</Label>
            <Input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orgSlug">Org Slug</Label>
            <Input
              id="orgSlug"
              type="text"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={handleCreateOrg}>
          Create Org
        </Button>

        {/* Select & Manage Org */}
        {organizations && organizations.length > 0 && (
          <>
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="selectOrg">Select Organization</Label>
                <select
                  id="selectOrg"
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="h-7 w-full rounded border border-input bg-transparent px-2 py-0.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2"
                >
                  <option value="">-- Select --</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetActiveOrg}
                disabled={!selectedOrgId}
              >
                Set Active
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearActiveOrg}
              >
                Clear Active
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteOrg}
                disabled={!selectedOrgId}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Delete Org
              </Button>
            </div>
          </>
        )}

        {activeOrg.data && (
          <p className="text-sm text-zinc-500">
            Active org:{" "}
            <span className="font-medium">{activeOrg.data.name}</span> (
            {activeOrg.data.slug})
          </p>
        )}
      </div>
    </DebugCard>
  );
}
