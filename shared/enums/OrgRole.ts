export enum OrgRole {
  Owner = "owner",
  Admin = "admin", 
  Member = "member",
}

export interface RolePermissions {
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canAssignOwner: boolean;
  canAssignAdmin: boolean;
  canDeleteOrg: boolean;
  canManageOrgSettings: boolean;
}

export const ROLE_PERMISSIONS: Record<OrgRole, RolePermissions> = {
  [OrgRole.Owner]: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canAssignOwner: true,
    canAssignAdmin: true,
    canDeleteOrg: true,
    canManageOrgSettings: true,
  },
  [OrgRole.Admin]: {
    canInviteMembers: true,
    canRemoveMembers: true,
    canAssignOwner: false,
    canAssignAdmin: true,
    canDeleteOrg: false,
    canManageOrgSettings: true,
  },
  [OrgRole.Member]: {
    canInviteMembers: false,
    canRemoveMembers: false,
    canAssignOwner: false,
    canAssignAdmin: false,
    canDeleteOrg: false,
    canManageOrgSettings: false,
  },
};

export const ROLE_DISPLAY_NAMES: Record<OrgRole, string> = {
  [OrgRole.Owner]: "Owner",
  [OrgRole.Admin]: "Admin",
  [OrgRole.Member]: "Member",
};

export const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  [OrgRole.Owner]: "Full control over the organization",
  [OrgRole.Admin]: "Manage organization settings and members",
  [OrgRole.Member]: "Basic access to organization features",
};
