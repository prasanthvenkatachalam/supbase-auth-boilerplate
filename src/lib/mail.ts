/**
 * Zepto Mail Utility
 * 
 * Handles sending transactional emails using Zoho Zepto Mail API.
 */

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const url = process.env.ZEPTOMAIL_URL;
  const token = process.env.ZEPTOMAIL_TOKEN;
  const fromAddress = process.env.EMAIL_SENDER_ADDRESS;
  const fromName = process.env.EMAIL_SENDER_NAME;

  if (!url || !token || !fromAddress) {
    console.error("Missing Zepto Mail configuration");
    return { success: false, error: "Missing configuration" };
  }

  // Normalize URL
  const baseUrl = url.startsWith("http") ? url : `https://${url}`;
  const apiUrl = `${baseUrl.replace(/\/$/, "")}/v1.1/email`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: token, // Zepto Mail expects the token directly or preficed with Zoho-enczapikey (user provided token already has it)
      },
      body: JSON.stringify({
        from: {
          address: fromAddress,
          name: fromName || "App Notification",
        },
        to: [
          {
            email_address: {
              address: to,
            },
          },
        ],
        subject: subject,
        htmlbody: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Zepto Mail error response:", data);
      return { success: false, error: data };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email via Zepto Mail:", error);
    return { success: false, error };
  }
}
