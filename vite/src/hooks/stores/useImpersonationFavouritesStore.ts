import { create } from "zustand";
import { persist } from "zustand/middleware";

export type FavouriteOrg = {
	kind: "org";
	org_id: string;
	org_slug: string;
	org_name: string;
	impersonation_user_id: string;
};

export type FavouriteUser = {
	kind: "user";
	user_id: string;
	user_email: string;
	user_name: string;
};

export type Favourite = FavouriteOrg | FavouriteUser;

interface ImpersonationFavouritesState {
	favourites: Favourite[];
	addOrg: (fav: FavouriteOrg) => void;
	removeOrg: (org_id: string) => void;
	addUser: (fav: FavouriteUser) => void;
	removeUser: (user_id: string) => void;
	isOrgFav: (org_id: string) => boolean;
	isUserFav: (user_id: string) => boolean;
}

export const useImpersonationFavouritesStore =
	create<ImpersonationFavouritesState>()(
		persist(
			(set, get) => ({
				favourites: [],

				addOrg: (fav) =>
					set((state) => {
						const filtered = state.favourites.filter(
							(f) => !(f.kind === "org" && f.org_id === fav.org_id),
						);
						return { favourites: [fav, ...filtered] };
					}),

				removeOrg: (org_id) =>
					set((state) => ({
						favourites: state.favourites.filter(
							(f) => !(f.kind === "org" && f.org_id === org_id),
						),
					})),

				addUser: (fav) =>
					set((state) => {
						const filtered = state.favourites.filter(
							(f) => !(f.kind === "user" && f.user_id === fav.user_id),
						);
						return { favourites: [fav, ...filtered] };
					}),

				removeUser: (user_id) =>
					set((state) => ({
						favourites: state.favourites.filter(
							(f) => !(f.kind === "user" && f.user_id === user_id),
						),
					})),

				isOrgFav: (org_id) =>
					get().favourites.some((f) => f.kind === "org" && f.org_id === org_id),

				isUserFav: (user_id) =>
					get().favourites.some(
						(f) => f.kind === "user" && f.user_id === user_id,
					),
			}),
			{
				name: "autumn:impersonation-favourites",
			},
		),
	);

export default useImpersonationFavouritesStore;
