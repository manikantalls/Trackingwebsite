import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function safeError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validatePassword(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return safeError(401, "Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !caller) return safeError(401, "Unauthorized");

    // Verify the caller is an admin by reading their profile
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (callerProfile?.role !== "admin") return safeError(403, "Forbidden");

    // ── DELETE user ──────────────────────────────────────────────
    if (req.method === "DELETE") {
      const body = await req.json();
      const userId = body?.userId;
      if (!userId || typeof userId !== "string") return safeError(400, "userId is required");

      await adminClient.from("profiles").delete().eq("id", userId);
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteErr) {
        console.error("[create-user] deleteUser error:", deleteErr);
        return safeError(400, "Failed to delete user");
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PATCH — reset a user's password ──────────────────────────
    if (req.method === "PATCH") {
      const body = await req.json();
      const { userId, password } = body ?? {};
      if (!userId || typeof userId !== "string") return safeError(400, "userId is required");
      if (!password || typeof password !== "string") return safeError(400, "password is required");

      const pwErr = validatePassword(password);
      if (pwErr) return safeError(400, pwErr);

      const { error: resetErr } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (resetErr) {
        console.error("[create-user] updateUserById error:", resetErr);
        return safeError(400, "Failed to reset password");
      }

      await adminClient.from("profiles").update({ must_reset_password: true }).eq("id", userId);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE user ──────────────────────────────────────────────
    const body = await req.json();
    const { email, password, full_name, role } = body ?? {};

    if (!email || typeof email !== "string" || !validateEmail(email)) {
      return safeError(400, "A valid email address is required");
    }
    if (!password || typeof password !== "string") {
      return safeError(400, "Password is required");
    }

    const pwErr = validatePassword(password);
    if (pwErr) return safeError(400, pwErr);

    const allowedRoles = ["admin", "user"];
    const safeRole = allowedRoles.includes(role) ? role : "user";

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: safeRole },
    });

    if (createErr) {
      console.error("[create-user] createUser error:", createErr);
      // Surface duplicate email as a user-friendly message, hide everything else
      if (createErr.message?.toLowerCase().includes("already registered") ||
          createErr.message?.toLowerCase().includes("already been registered") ||
          createErr.message?.toLowerCase().includes("duplicate")) {
        return safeError(400, "A user with this email already exists");
      }
      return safeError(400, "Failed to create user");
    }

    await adminClient.from("profiles").upsert({
      id: newUser.user.id,
      email,
      full_name: full_name ?? "",
      role: safeRole,
      must_reset_password: true,
    }, { onConflict: "id" });

    return new Response(JSON.stringify({ id: newUser.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-user] unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
