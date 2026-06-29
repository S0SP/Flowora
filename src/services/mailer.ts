import nodemailer from "nodemailer";

export interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password?: string;
  email_from_name: string;
  email_from: string;
}

export interface TemplateVariables {
  brand_name?: string;
  logo_url?: string;
  title?: string;
  body?: string;
  button_text?: string;
  button_url?: string;
  footer?: string;
}

export interface LeadVariables {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

// Main Send Email function
export async function sendMail(config: SmtpConfig, to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: Number(config.smtp_port) || 587,
    secure: Number(config.smtp_port) === 465, // True for port 465, false for others
    auth: {
      user: config.smtp_user,
      pass: config.smtp_password,
    },
    tls: {
      rejectUnauthorized: false, // Helps avoid self-signed certificate errors in local development
    },
  });

  const mailOptions = {
    from: `"${config.email_from_name || "CRM Admin"}" <${config.email_from || config.smtp_user}>`,
    to,
    subject,
    html,
  };

  return transporter.sendMail(mailOptions);
}

// 6 Premium responsive HTML layouts
export const PREMADE_EMAIL_TEMPLATES = [
  {
    id: "welcome",
    name: "Ebook & Lead Magnet Delivery",
    defaultSubject: "Your Free Ebook is ready! 📚",
    defaultTitle: "Here is your free download",
    defaultBody: "Hi {{lead_name}},\n\nThank you for requesting our guide! We're excited for you to read it. It is packed with actionable insights that you can implement right away.\n\nClick the button below to download your copy immediately. Let us know what you think!",
    defaultButtonText: "Download Free Guide",
    defaultButtonUrl: "https://yourdomain.com/downloads/guide.pdf",
    themeColor: "#10b981", // Emerald green
  },
  {
    id: "consultation",
    name: "Book a Consultation Call",
    defaultSubject: "Let's connect! Schedule your 15-minute call 📞",
    defaultTitle: "Let's discuss your goals",
    defaultBody: "Hi {{lead_name}},\n\nThanks for reaching out! We received your details. I would love to learn more about your business goals and see how we can help you accelerate growth.\n\nPlease pick a convenient time on my calendar for a quick 15-minute introductory call using the button below.",
    defaultButtonText: "Schedule Call on Calendly",
    defaultButtonUrl: "https://calendly.com/your-username/15min",
    themeColor: "#3b82f6", // Royal blue
  },
  {
    id: "offer",
    name: "Special Discount / Offer",
    defaultSubject: "Exclusive Offer: 20% OFF inside! 🎉",
    defaultTitle: "Special discount just for you",
    defaultBody: "Hi {{lead_name}},\n\nWelcome to our community! To thank you for joining, we're giving you an exclusive 20% discount on your first purchase.\n\nSimply click the button below to visit our store, and the discount will be applied automatically at checkout. Enjoy!",
    defaultButtonText: "Claim 20% Discount",
    defaultButtonUrl: "https://yourdomain.com/shop?coupon=WELCOME20",
    themeColor: "#ec4899", // Pink/Rose
  },
  {
    id: "demo",
    name: "Product Demo & Activation",
    defaultSubject: "Access granted: Your demo account is ready! 🚀",
    defaultTitle: "Welcome to your new dashboard",
    defaultBody: "Hi {{lead_name}},\n\nYour account has been provisioned! You now have full access to our premium suite. Here are your next steps:\n\n1. Click the button below to log in.\n2. Follow the 3-step setup wizard.\n3. Import your first dataset.\n\nLet us know if you need help getting started!",
    defaultButtonText: "Log In to Dashboard",
    defaultButtonUrl: "https://dashboard.yourdomain.com/login",
    themeColor: "#8b5cf6", // Purple
  },
  {
    id: "confirmation",
    name: "General Lead Confirmation",
    defaultSubject: "We received your request! We'll be in touch 🤝",
    defaultTitle: "Thank you for reaching out",
    defaultBody: "Hi {{lead_name}},\n\nThis is to confirm we received your request. Our team of digital marketing experts is reviewing your information right now.\n\nOne of our account managers will contact you within the next 24 business hours to discuss your project in detail. Talk soon!",
    defaultButtonText: "Visit Our Website",
    defaultButtonUrl: "https://yourdomain.com",
    themeColor: "#14b8a6", // Teal
  },
  {
    id: "invitation",
    name: "Webinar / Event Invitation",
    defaultSubject: "You're invited: Join our live training session 🎙️",
    defaultTitle: "Reserve your spot today",
    defaultBody: "Hi {{lead_name}},\n\nWe are hosting a live training session on how to build high-converting lead pipelines. Space is strictly limited to 100 participants.\n\nClick the button below to confirm your registration and add the event to your calendar.",
    defaultButtonText: "Reserve My Seat",
    defaultButtonUrl: "https://yourdomain.com/webinar/register",
    themeColor: "#f59e0b", // Amber/Gold
  },
];

// Compiles and returns a beautifully styled responsive HTML email
export function compileEmailTemplate(
  templateId: string,
  variables: TemplateVariables,
  lead: LeadVariables
): string {
  const template = PREMADE_EMAIL_TEMPLATES.find((t) => t.id === templateId) || PREMADE_EMAIL_TEMPLATES[0];
  const color = template.themeColor;

  const brandName = variables.brand_name || "Our Brand";
  const logoHtml = variables.logo_url
    ? `<img src="${variables.logo_url}" alt="${brandName}" style="max-height: 48px; max-width: 200px; display: block; margin: 0 auto;" />`
    : `<span style="font-size: 20px; font-weight: bold; color: #1e293b; letter-spacing: -0.5px;">${brandName}</span>`;

  // Placeholders helper
  const replacePlaceholders = (text: string): string => {
    if (!text) return "";
    return text
      .replace(/\{\{lead_name\}\}/g, lead.name || "there")
      .replace(/\{\{lead_email\}\}/g, lead.email || "")
      .replace(/\{\{lead_phone\}\}/g, lead.phone || "")
      .replace(/\{\{brand_name\}\}/g, brandName);
  };

  const title = replacePlaceholders(variables.title || template.defaultTitle);
  const bodyText = replacePlaceholders(variables.body || template.defaultBody);
  const buttonText = replacePlaceholders(variables.button_text || template.defaultButtonText);
  const buttonUrl = replacePlaceholders(variables.button_url || template.defaultButtonUrl);
  const footerText = replacePlaceholders(variables.footer || `© ${new Date().getFullYear()} ${brandName}. All rights reserved.`);

  // Convert newlines in body text to HTML line breaks
  const bodyHtml = bodyText.replace(/\n/g, "<br />");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f6f9fc;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
  </style>
</head>
<body style="background-color: #f6f9fc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; padding: 40px 10px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f6f9fc;">
    <tr>
      <td align="center">
        <!-- Card wrapper -->
        <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #eef2f6; box-shadow: 0 4px 12px rgba(0,0,0,0.015);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 30px; border-bottom: 1px solid #f1f5f9;">
              ${logoHtml}
            </td>
          </tr>
          
          <!-- Colored Accent Line -->
          <tr>
            <td height="4" style="background-color: ${color}; height: 4px; line-height: 4px; font-size: 4px;">&nbsp;</td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <h1 style="margin: 0 0 20px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${title}
              </h1>
              
              <div style="margin: 0 0 30px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                ${bodyHtml}
              </div>

              <!-- Button CTA -->
              ${buttonText && buttonUrl ? `
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 10px; margin-bottom: 10px;">
                <tr>
                  <td align="center" bgcolor="${color}" style="border-radius: 8px;">
                    <a href="${buttonUrl}" target="_blank" style="display: inline-block; padding: 13px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ""}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 30px; font-size: 12px; color: #94a3b8; background-color: #f8fafc; border-top: 1px solid #f1f5f9; line-height: 1.5;">
              <p style="margin: 0 0 10px 0;">
                ${footerText}
              </p>
              <p style="margin: 0;">
                If you have any questions, feel free to reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
