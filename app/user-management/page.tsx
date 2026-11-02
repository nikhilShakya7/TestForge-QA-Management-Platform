import { redirect } from "next/navigation";
import {
  getCurrentUser,
  getSessionFromCookies,
} from "@/lib/auth";
import UserManagementContent from "./user-management-content";

export default async function UserManagementPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/auth/login");
  }

  const user = await getCurrentUser(session.userId);
  if (!user?.isActive) {
    redirect("/auth/login");
  }
  if (user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  return <UserManagementContent />;
}
