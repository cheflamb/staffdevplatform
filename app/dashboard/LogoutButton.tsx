"use client";

import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <button
      onClick={logout}
      style={{
        padding: "8px 16px",
        fontWeight: 600,
        cursor: "pointer",
        border: "1px solid #d1d5db",
        borderRadius: 6,
        background: "white",
      }}
    >
      Log out
    </button>
  );
}
