import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Load configuration from environment variables (with fallback defaults)
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "AC21e7f3efe011828cab38cc9fc3d93ffd";
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "1e4e5fa08c59912c0a3eb07dac74d5e4";
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER") || "+17372508034";
  const TWILIO_WHATSAPP_NUMBER = "whatsapp:+14155238886";

  try {
    const { recipient, channels, message } = await req.json();

    const results: Record<string, unknown> = {
      email: false,
      sms: false,
      whatsapp: false,
      errors: {},
    };

    // Sanitize phone number (strip whitespace/dashes, prepend + if needed)
    let rawDigits = (recipient?.phone || "").toString().replace(/[^0-9]/g, "");
    const formattedPhone = rawDigits ? `+${rawDigits}` : "";

    // 1. Resend Email Dispatch
    if (channels?.email && recipient?.email && RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "CommunityBot <onboarding@resend.dev>",
            to: [recipient.email],
            subject: `Community Notification for ${recipient.name || "Member"}`,
            text: message,
          }),
        });

        results.email = emailRes.ok;
        if (!emailRes.ok) {
          const emailData = await emailRes.json();
          (results.errors as Record<string, unknown>).email = emailData.message || emailData;
        }
      } catch (err) {
        (results.errors as Record<string, unknown>).email = String(err);
      }
    }

    const twilioCredentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    // 2. Twilio SMS Dispatch
    if (channels?.sms && formattedPhone) {
      try {
        const smsParams = new URLSearchParams({
          To: formattedPhone,
          From: TWILIO_PHONE_NUMBER,
          Body: message,
        });

        const smsRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${twilioCredentials}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: smsParams.toString(),
          }
        );

        const smsData = await smsRes.json();
        if (!smsRes.ok) {
          console.error("Twilio SMS failure payload:", smsData);
          (results.errors as Record<string, unknown>).sms = smsData.message || smsData;
        } else {
          results.sms = true;
        }
      } catch (err) {
        console.error("SMS Network Error:", err);
        (results.errors as Record<string, unknown>).sms = String(err);
      }
    }

    // 3. Twilio WhatsApp Dispatch
    if (channels?.whatsapp && formattedPhone) {
      try {
        const waParams = new URLSearchParams({
          To: `whatsapp:${formattedPhone}`,
          From: TWILIO_WHATSAPP_NUMBER,
          Body: message,
        });

        const waRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${twilioCredentials}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: waParams.toString(),
          }
        );

        const waData = await waRes.json();
        if (!waRes.ok) {
          console.error("Twilio WhatsApp failure payload:", waData);
          (results.errors as Record<string, unknown>).whatsapp = waData.message || waData;
        } else {
          results.whatsapp = true;
        }
      } catch (err) {
        console.error("WhatsApp Network Error:", err);
        (results.errors as Record<string, unknown>).whatsapp = String(err);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});