import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/environment.js';

let cachedTransporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return env.smtp.enabled;
}

function getTransporter(): Transporter | null {
  if (!env.smtp.enabled || !env.smtp.host) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      ...(env.smtp.user && env.smtp.pass ? { auth: { user: env.smtp.user, pass: env.smtp.pass } } : {}),
    });
  }
  return cachedTransporter;
}

export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter || !env.smtp.from) return false;

  const subject = 'Reset your Urbaser Sumeet Intranet password';
  const text = [
    `Hello ${params.name},`,
    '',
    'A password reset was requested for your Urbaser Sumeet Intranet account.',
    `Use this one-time link within ${params.expiresMinutes} minutes to set a new password:`,
    params.resetUrl,
    '',
    'If you did not request this, you can safely ignore this email.',
  ].join('\n');

  const safeName = escapeHtml(params.name);
  const safeUrl = escapeHtml(params.resetUrl);
  const html = `
    <p>Hello ${safeName},</p>
    <p>A password reset was requested for your Urbaser Sumeet Intranet account.</p>
    <p>
      <a href="${safeUrl}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#84cc16;color:#10200f;font-weight:600;text-decoration:none;">
        Reset password
      </a>
    </p>
    <p>Or copy and paste this link into your browser (expires in ${params.expiresMinutes} minutes):</p>
    <p><code>${safeUrl}</code></p>
    <p>If you did not request this, you can safely ignore this email.</p>
  `.trim();

  await transporter.sendMail({
    from: env.smtp.from,
    to: params.to,
    subject,
    text,
    html,
  });

  return true;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
