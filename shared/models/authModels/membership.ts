import { Member, User } from "../../db/auth-schema.js";

export interface Membership {
	user: User;
	member: Member;
}
