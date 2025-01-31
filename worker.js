export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://hackucf-remix.pages.dev/',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method Not Allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formData;
    try {
      formData = await request.formData();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid form data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const email = formData.get('email');
    const firstName = formData.get('firstName');
    const lastName = formData.get('lastName');
    const message = formData.get('message');

    if (!email || !firstName || !lastName || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simple email validation
    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize inputs to prevent injection attacks
    function escapeHtml(unsafe) {
      return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    const escapedFirstName = escapeHtml(firstName);
    const escapedLastName = escapeHtml(lastName);
    const escapedEmail = escapeHtml(email);
    const escapedMessage = escapeHtml(message).replace(/\n/g, '<br>');

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
          to: [{ email: 'ops@hackucf.org', name: 'HackUCF Ops' }],
        },
      ],
      from: {
        email: 'noreply@holyscriptors.club',
        name: 'HackUCF Contact Form',
      },
      subject: 'New Contact Us Message from HackUCF Website',
      content: [
        {
          type: 'text/plain',
          value: textContent,
        },
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    };

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendgridBody),
      });

      if (response.ok) {
        return new Response(
          JSON.stringify({ message: 'Email sent successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        console.error('SendGrid API Error:', response.statusText);
        return new Response(
          JSON.stringify({ error: 'Failed to send email' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('Fetch Error:', error.message);
      return new Response(
        JSON.stringify({ error: 'Error sending email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  },
};

