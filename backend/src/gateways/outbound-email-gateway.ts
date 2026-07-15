import nodemailer from "nodemailer";
import type { User } from "../types.js";

export interface OutboundEmailPayload {
  to: string;
  subject: string;
  body: string;
}

export interface OutboundEmailReceipt {
  messageId: string;
}

export interface OutboundEmailGateway {
  send(user: User, payload: OutboundEmailPayload): Promise<OutboundEmailReceipt>;
}

export const nodemailerOutboundEmailGateway: OutboundEmailGateway = {
  async send(user, payload) {
    if (!user.outboundEmail || !user.smtpHost || !user.smtpUser || !user.smtpPassword) {
      throw new Error("请先在个人信息页完整配置发件邮箱、SMTP服务器、账号和授权码");
    }
    const smtpPort = Number(user.smtpPort || 465);
    const smtpSecure = user.smtpSecure ?? true;
    if (smtpPort === 587 && smtpSecure) {
      throw new Error("SMTP配置不匹配：端口 587 通常应选择 STARTTLS/普通；如果要使用 SSL/TLS，请把端口改为 465。");
    }
    if (smtpPort === 465 && !smtpSecure) {
      throw new Error("SMTP配置不匹配：端口 465 通常应选择 SSL/TLS；如果要使用 STARTTLS/普通，请把端口改为 587。");
    }
    const transport = process.env.NODE_ENV === "test"
      ? nodemailer.createTransport({ streamTransport: true, newline: "unix", buffer: true })
      : nodemailer.createTransport({
        host: user.smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10_000),
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10_000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30_000),
        auth: {
          user: user.smtpUser,
          pass: user.smtpPassword
        }
      });
    const info = await transport.sendMail({
      from: `"${user.emailSenderName || user.name}" <${user.outboundEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body
    });
    return { messageId: String(info.messageId || "") };
  }
};

export function outboundEmailError(error: unknown, user: User) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.startsWith("请先") || message.startsWith("SMTP配置不匹配")) return message;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const response = typeof error === "object" && error && "response" in error ? String((error as { response?: unknown }).response || "") : "";
  const raw = `${message} ${response}`.trim();
  const lower = raw.toLowerCase();
  if (code === "EAUTH" || raw.includes("535") || lower.includes("invalid login") || lower.includes("authentication")) {
    return "SMTP认证失败：请确认 SMTP账号 是完整邮箱，授权码不是网页登录密码，并且邮箱后台已开启 SMTP 服务。QQ邮箱请使用“授权码/客户端专用密码”。";
  }
  if (code === "ESOCKET" || code === "ECONNECTION" || code === "ETIMEDOUT" || lower.includes("wrong version number") || lower.includes("ssl")) {
    return `SMTP连接失败：请检查服务器、端口和加密方式。当前配置为 ${user.smtpHost}:${user.smtpPort || 465}，${user.smtpSecure ?? true ? "SSL/TLS" : "STARTTLS/普通"}。`;
  }
  if (raw.includes("550") || lower.includes("sender")) {
    return "SMTP发件人被拒绝：请确认发件邮箱、SMTP账号属于同一个邮箱账号，且服务商允许该账号外发。";
  }
  return `邮件发送失败：${message || "SMTP服务未返回明确原因"}`;
}
