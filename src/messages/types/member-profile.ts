export type MemberProfile = {
  userId: string;
  nickname?: string;
  name?: string;
  image?: string;
  role?: "owner" | "member";
};
