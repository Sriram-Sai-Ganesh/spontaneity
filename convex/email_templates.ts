type EmailContext = {
  groupName: string;
  eventTitle?: string;
  eventDate?: string;
  planUrl?: string;
};

function baseTemplate(title: string, body: string, siteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;">Spontaneity</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                You're receiving this because you have email notifications enabled.<br/>
                You can turn these off in your
                <a href="${siteUrl}/profile" style="color:#71717a;">profile settings</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background-color:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${label}</a>`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;font-size:14px;color:#71717a;width:80px;">${label}</td>
    <td style="padding:4px 0;font-size:14px;color:#18181b;font-weight:500;">${value}</td>
  </tr>`;
}

export function newRecommendationsTemplate(ctx: EmailContext, siteUrl: string): { subject: string; html: string } {
  const subject = `New event recommendations for ${ctx.groupName}`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">New recommendations ready</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;">
      Your group <strong>${ctx.groupName}</strong> has new event recommendations waiting for a decision.
    </p>
    <p style="margin:0;font-size:14px;color:#71717a;">
      Open the app to review what's been suggested and vote with your group.
    </p>
    ${ctx.planUrl ? ctaButton(ctx.planUrl, "View Recommendations") : ""}
  `;

  return { subject, html: baseTemplate(subject, body, siteUrl) };
}

export function planAcceptedTemplate(ctx: EmailContext, siteUrl: string): { subject: string; html: string } {
  const subject = `Your group agreed on a plan — ${ctx.eventTitle ?? "an event"}`;

  const hasDetails = ctx.eventTitle ?? ctx.eventDate;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">You're going out!</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;">
      Your group <strong>${ctx.groupName}</strong> has agreed on a plan.
    </p>
    ${hasDetails ? `
    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${ctx.eventTitle ? detailRow("Event", ctx.eventTitle) : ""}
      ${ctx.eventDate ? detailRow("Date", ctx.eventDate) : ""}
    </table>` : ""}
    ${ctx.planUrl ? ctaButton(ctx.planUrl, "View Plan Details") : ""}
  `;

  return { subject, html: baseTemplate(subject, body, siteUrl) };
}

export function eventReminderTemplate(ctx: EmailContext, siteUrl: string): { subject: string; html: string } {
  const subject = `Reminder: ${ctx.eventTitle ?? "Your event"} is coming up`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">Your event is coming up</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;">
      Don't forget — your group <strong>${ctx.groupName}</strong> has an upcoming event.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${ctx.eventTitle ? detailRow("Event", ctx.eventTitle) : ""}
      ${ctx.eventDate ? detailRow("Date", ctx.eventDate) : ""}
    </table>
    ${ctx.planUrl ? ctaButton(ctx.planUrl, "View Event Details") : ""}
  `;

  return { subject, html: baseTemplate(subject, body, siteUrl) };
}

export function shortlistReminderTemplate(ctx: EmailContext, siteUrl: string): { subject: string; html: string } {
  const subject = `Still thinking about ${ctx.eventTitle ?? "this event"}?`;

  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#18181b;">Still thinking about this?</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#52525b;">
      Your group <strong>${ctx.groupName}</strong> shortlisted an event that's coming up soon.
    </p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${ctx.eventTitle ? detailRow("Event", ctx.eventTitle) : ""}
      ${ctx.eventDate ? detailRow("Date", ctx.eventDate) : ""}
    </table>
    ${ctx.planUrl ? ctaButton(ctx.planUrl, "Review Shortlist") : ""}
  `;

  return { subject, html: baseTemplate(subject, body, siteUrl) };
}

export type NotificationType =
  | "new_recommendations"
  | "plan_accepted"
  | "event_reminder"
  | "shortlist_reminder";

const PROD_URL = "https://cs423sp26-homeworks.github.io/team-05";

export function getSiteUrl(): string {
  return process.env.SITE_URL ?? PROD_URL;
}

export function buildEmail(
  notificationType: NotificationType,
  context: EmailContext,
  siteUrl: string,
): { subject: string; html: string } {
  switch (notificationType) {
    case "new_recommendations":
      return newRecommendationsTemplate(context, siteUrl);
    case "plan_accepted":
      return planAcceptedTemplate(context, siteUrl);
    case "event_reminder":
      return eventReminderTemplate(context, siteUrl);
    case "shortlist_reminder":
      return shortlistReminderTemplate(context, siteUrl);
  }
}
