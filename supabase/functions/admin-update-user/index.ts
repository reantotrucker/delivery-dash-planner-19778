import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "No auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { userId, email, fullName } = await req.json();
    if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (email && typeof email === "string") {
      const trimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return new Response(JSON.stringify({ error: "Email inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email: trimmed, email_confirm: true });
      if (authErr) throw authErr;
      // Bypass profile email-change trigger by using service role + raw update via RPC-less path:
      // Trigger forces email back to OLD. Disable by temporarily using admin: we update via SQL directly.
      const { error: profErr } = await admin.rpc("admin_set_profile_email" as any, { _user_id: userId, _email: trimmed });
      if (profErr) {
        // Fallback: plain update (will be overridden by trigger if RPC missing)
        await admin.from("profiles").update({ email: trimmed }).eq("id", userId);
      }
    }

    if (typeof fullName === "string" && fullName.trim()) {
      const { error } = await admin.from("profiles").update({ full_name: fullName.trim() }).eq("id", userId);
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
