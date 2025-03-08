export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://hackucf-remix.pages.dev/",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (error) {
      return new Response(JSON.stringify({ error: "Invalid form data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = formData.get("email");
    const firstName = formData.get("firstName");
    const lastName = formData.get("lastName");
    const message = formData.get("message");
    const turnstileResponse = formData.get("cf-turnstile-response");

    if (!email || !firstName || !lastName || !message || !turnstileResponse) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate Cloudflare Turnstile token
    const turnstileValidation = await validateTurnstileToken(
      turnstileResponse,
      request,
      env,
    );
    if (!turnstileValidation.success) {
      return new Response(
        JSON.stringify({
          error: "Turnstile validation failed",
          details: turnstileValidation.error,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Simple email validation
    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    // Then, modify the email validation check in the main code to be async
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitize inputs to prevent injection attacks
    function escapeHtml(unsafe) {
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const escapedFirstName = escapeHtml(firstName);
    const escapedLastName = escapeHtml(lastName);
    const escapedEmail = escapeHtml(email);
    const escapedMessage = escapeHtml(message).replace(/\n/g, "");

    const textContent = `Name: ${firstName} ${lastName}\nEmail: ${email}\nMessage: ${message}`;

    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; background-color: #000000; color: #FFD200; padding: 20px;">
        <h1 style="color: #EEEEEE;">[ops] New Contact Us Message Received</h1>
          <div style="background-color: #000000; padding: 20px; border-radius: 5px;">
            <p><strong>Name:</strong> ${escapedFirstName} ${escapedLastName}</p>
            <p><strong>Email:</strong> ${escapedEmail}</p>
            <p><strong>Message:</strong></p>
            <p>${escapedMessage}</p>
          </div>
        </body>
      </html>
    `;

    const sendgridBody = {
      personalizations: [
        {
          to: [{ email: "ops@hackucf.org", name: "HackUCF Ops" }],
        },
      ],
      from: {
        email: "noreply@hackucf.org",
        name: "HackUCF Contact Form",
      },
      subject: "New Contact Us Message from HackUCF Website",
      content: [
        {
          type: "text/plain",
          value: textContent,
        },
        {
          type: "text/html",
          value: htmlContent,
        },
      ],
    };

    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sendgridBody),
      });

      if (response.ok) {
        return new Response(
          JSON.stringify({ message: "Email sent successfully" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } else {
        console.error("SendGrid API Error:", response.statusText);
        return new Response(JSON.stringify({ error: "Failed to send email" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (error) {
      console.error("Fetch Error:", error.message);
      return new Response(JSON.stringify({ error: "Error sending email" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};

// Function to validate Cloudflare Turnstile token
async function validateTurnstileToken(token, request, env) {
  try {
    // Get the client IP address
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "127.0.0.1";

    // Make a request to the Cloudflare Turnstile verification endpoint
    const formData = new FormData();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    formData.append("remoteip", clientIP);

    const result = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: formData,
      },
    );

    const outcome = await result.json();

    if (outcome.success) {
      return { success: true };
    } else {
      console.error("Turnstile validation failed:", outcome);
      console.log(outcome);
      return {
        success: false,
        error: outcome["error-codes"] || "Unknown validation error",
      };
    }
  } catch (error) {
    console.error("Error validating Turnstile token:", error);
    return {
      success: false,
      error: "Internal validation error",
    };
  }
}
