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

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  // Standard Twilio WhatsApp Sandbox number
  const TWILIO_WHATSAPP_NUMBER = "whatsapp:+14155238886";

  try {
    const { recipient, channels, message } = await req.json();

    const results = {
      email: false,
      sms: false,
      whatsapp: false,
    };

    // Format phone number with +
    const rawDigits = recipient?.phone ? recipient.phone.replace(/[^0-9]/g, "") : "";
    const formattedPhone = rawDigits.startsWith("+") ? rawDigits : `+${rawDigits}`;

    // 1. Send Background Email via Resend
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
            subject: `Community Notification for ${recipient.name}`,
            text: message,
          }),
        });
        results.email = emailRes.ok;
      } catch (err) {
        console.error("Resend Error:", err);
      }
    }

    // 2. Prepare Twilio Basic Auth
    const twilioAuth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    // 3. Send Carrier SMS via Twilio
    if (channels?.sms && rawDigits && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
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
              "Authorization": `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: smsParams.toString(),
          }
        );
        results.sms = smsRes.ok;
      } catch (err) {
        console.error("Twilio SMS Error:", err);
      }
    }

    // 4. Send WhatsApp via Twilio WhatsApp API
    if (channels?.whatsapp && rawDigits && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
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
              "Authorization": `Basic ${twilioAuth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: waParams.toString(),
          }
        );
        results.whatsapp = waRes.ok;
      } catch (err) {
        console.error("Twilio WhatsApp Error:", err);
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});