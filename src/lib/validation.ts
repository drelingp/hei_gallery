import { z } from 'zod';

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export const artworkSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(4000).default(''),
  category: z.enum(['DRAWING', 'CERAMIC']),
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  available: z.coerce.boolean().default(true),
  price: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '' || v === null) return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }),
  currency: z.string().min(3).max(3).default('USD'),
  paypalLink: z
    .string()
    .trim()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
});

export const settingsSchema = z.object({
  siteTitle: z.string().min(1).max(80),
  tagline: z.string().max(200),
  artistName: z.string().min(1).max(80),
  artistBio: z.string().max(8000),
  contactEmail: z.string().email().or(z.literal('')),
  paypalEmail: z.string().email().or(z.literal('')).optional(),
});

export const inquirySchema = z.object({
  artworkId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  message: z.string().min(5).max(4000),
  // Honeypot field; bots tend to fill it.
  website: z.string().max(0).optional().or(z.literal('')),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const setupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(10).max(200),
});
