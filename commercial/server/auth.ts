import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { demoAdminEmail, demoOwnerEmail, demoPeople, type Config } from '../src/types';
import { digest } from './catalog';
import { requireRule } from './domain';

export type Identity = { id: string; email: string };
const scrypt = promisify(derive);

export function makeAuth(config: Config, demoOwnerPassword?: string) {
  const tokens = new Map<string, { identity: Identity; expiresAt: number }>();
  const credentials = new Map<string, { salt: Buffer; hash: Buffer }>();
  const provider = config.demo ? null : createClient(config.authUrl, config.authKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const reserved = (email: string) => email === demoAdminEmail || demoPeople.some(person => person.email === email);
  const ownerSalt = randomBytes(16);
  const ownerHash = config.demo && demoOwnerPassword ? scrypt(demoOwnerPassword, ownerSalt, 64) : null;
  function issue(email: string) {
    const now = Date.now();
    for (const [key, token] of tokens) if (token.expiresAt < now) tokens.delete(key);
    requireRule(tokens.size < 1000, 429, 'محاولات كثيرة. حاول لاحقًا.');
    const token = randomBytes(32).toString('base64url');
    tokens.set(digest(token), { identity: { id: `demo:${email}`, email }, expiresAt: now + 8 * 60 * 60 * 1000 });
    return token;
  }

  return {
    signIn(email: string) {
      requireRule(config.demo && reserved(email), 400, 'اختر حسابًا تجريبيًا.');
      return issue(email);
    },
    async password(email: string, password: string, register: boolean) {
      requireRule(config.demo, 404, 'الصفحة غير متاحة.');
      if (email === demoOwnerEmail) {
        requireRule(!register, 409, 'هذا البريد مخصّص لمالك المعاينة.');
        requireRule(ownerHash, 401, 'البريد أو كلمة المرور غير صحيحة.');
        const attempted = await scrypt(password, ownerSalt, 64) as Buffer;
        requireRule(timingSafeEqual(await ownerHash as Buffer, attempted), 401, 'البريد أو كلمة المرور غير صحيحة.');
        return issue(email);
      }
      const saved = credentials.get(email);
      if (register) {
        requireRule(!saved && !reserved(email), 409, 'هذا البريد مسجّل أو محجوز للتجربة.');
        requireRule(credentials.size < 300, 429, 'وصلت المعاينة إلى حد الحسابات.');
        const salt = randomBytes(16);
        const hash = await scrypt(password, salt, 64) as Buffer;
        requireRule(!credentials.has(email), 409, 'هذا البريد مسجّل.');
        const token = issue(email);
        credentials.set(email, { salt, hash });
        return token;
      }
      requireRule(saved, 401, 'البريد أو كلمة المرور غير صحيحة.');
      const hash = await scrypt(password, saved.salt, 64) as Buffer;
      requireRule(timingSafeEqual(saved.hash, hash), 401, 'البريد أو كلمة المرور غير صحيحة.');
      return issue(email);
    },
    async verify(token: string) {
      if (provider) {
        const { data, error } = await provider.auth.getUser(token);
        requireRule(!error && data.user?.email && data.user.email_confirmed_at, 401, 'سجّل دخولك ببريد مؤكّد للمتابعة.');
        return { id: `supabase:${data.user.id}`, email: data.user.email.toLowerCase() };
      }
      const session = tokens.get(digest(token));
      requireRule(session && session.expiresAt > Date.now(), 401, 'سجّل الدخول للمتابعة.');
      return session.identity;
    },
    signOut(token: string) { tokens.delete(digest(token)); },
  };
}
