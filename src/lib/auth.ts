import { cookies } from 'next/headers';
import { getIronSession, type SessionOptions } from 'iron-session';
import bcrypt from 'bcryptjs';
import { env } from './env';
import { prisma } from './db';

export type SessionData = {
  userId?: string;
  email?: string;
  role?: 'ADMIN' | 'EDITOR';
  csrf?: string;
};

export const sessionOptions: SessionOptions = {
  password: env.sessionPassword,
  cookieName: 'hei_gallery_session',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8, // 8h
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session.userId) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function adminExists() {
  const count = await prisma.user.count();
  return count > 0;
}

export function generateCsrf() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getCsrf() {
  const session = await getSession();
  return session.csrf ?? null;
}

export async function getOrCreateCsrf() {
  const session = await getSession();
  if (!session.csrf) {
    session.csrf = generateCsrf();
    await session.save();
  }
  return session.csrf;
}

export async function assertCsrf(formToken: string | null | undefined) {
  const session = await getSession();
  if (!session.csrf || !formToken || session.csrf !== formToken) {
    throw new Response('Invalid CSRF token', { status: 403 });
  }
}
