import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { buildEmail, getSiteUrl } from "./email_templates";

export const notificationTypeValidator = v.union(
  v.literal("new_recommendations"),
  v.literal("plan_accepted"),
  v.literal("event_reminder"),
  v.literal("shortlist_reminder"),
);

export const emailContextValidator = v.object({
  groupName: v.string(),
  eventTitle: v.optional(v.string()),
  eventDate: v.optional(v.string()),
  planUrl: v.optional(v.string()),
});


/** Fetch a user's email address. */
export const getUserEmailQuery = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ email: v.optional(v.string()) }), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return { email: user.email };
  },
});

/** Record the result of an email send attempt. */
export const logEmail = internalMutation({
  args: {
    userId: v.id("users"),
    recipientEmail: v.string(),
    notificationType: notificationTypeValidator,
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    errorMessage: v.optional(v.string()),
    resendId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("emailLogs", args);
    return null;
  },
});

/**
 * Send an email notification to a user.
 * - Skips if user has opted out or has no email address.
 * - Logs every attempt (sent / failed / skipped).
 * - Never throws — failures are caught and logged gracefully.
 */
export const sendNotification = internalAction({
  args: {
    userId: v.id("users"),
    notificationType: notificationTypeValidator,
    context: emailContextValidator,
  },
  returns: v.null(),
  handler: async (ctx, { userId, notificationType, context }) => {
    // 1. Check opt-out preference
    const enabled: boolean = await ctx.runQuery(
      internal.notification_preferences_queries.isEmailEnabledForUser,
      { userId },
    );
    if (!enabled) {
      await ctx.runMutation(internal.email_service.logEmail, {
        userId,
        recipientEmail: "",
        notificationType,
        status: "skipped",
      });
      return null;
    }

    // 2. Fetch user email
    const userRow = await ctx.runQuery(internal.email_service.getUserEmailQuery, { userId });
    if (!userRow?.email) {
      await ctx.runMutation(internal.email_service.logEmail, {
        userId,
        recipientEmail: "",
        notificationType,
        status: "skipped",
        errorMessage: "No email address on file",
      });
      return null;
    }

    const recipientEmail = userRow.email;
    const { subject, html } = buildEmail(notificationType, context, getSiteUrl());

    // 3. Send via Resend
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: "Spontaneity <noreply@sriram.io>",
        to: recipientEmail,
        subject,
        html,
      });

      if (error ?? !data) {
        await ctx.runMutation(internal.email_service.logEmail, {
          userId,
          recipientEmail,
          notificationType,
          status: "failed",
          errorMessage: error?.message ?? "Unknown Resend error",
        });
        return null;
      }

      await ctx.runMutation(internal.email_service.logEmail, {
        userId,
        recipientEmail,
        notificationType,
        status: "sent",
        resendId: data.id,
      });
    } catch (err) {
      await ctx.runMutation(internal.email_service.logEmail, {
        userId,
        recipientEmail,
        notificationType,
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }

    return null;
  },
});
