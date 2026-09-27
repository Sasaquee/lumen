import * as Crypto from 'expo-crypto';
import type { Setting } from './types';
import { deleteSetting, setSetting } from './db';

/**
 * Bloqueio do app: PIN, senha comum ou padrão 3x3, com a digital como atalho.
 *
 * O segredo nunca é guardado: fica só um hash SHA-256 com sal. Como o app é offline e
 * não tem conta, a recuperação é um código gerado na criação da senha, mostrado uma vez
 * só, que a pessoa guarda fora do celular. Essas chaves ficam fora do backup exportado,
 * para uma senha não viajar num arquivo que pode ir parar no Drive ou no WhatsApp.
 */
export type LockType = 'pin' | 'password' | 'pattern';

export const LOCK_TYPE = 'lock_type';
export const LOCK_HASH = 'lock_hash';
export const LOCK_SALT = 'lock_salt';
/** Tamanho do PIN: o teclado confere sozinho quando chega nele. */
export const LOCK_PIN_LEN = 'lock_pin_len';
/** Segundos fora do app até pedir de novo; -1 = só ao abrir o app. */
export const LOCK_TIMEOUT = 'lock_timeout';
export const LOCK_BIOMETRIC = 'lock_biometric';
/** Hash do código de recuperação e o sal dele. */
export const LOCK_RECOVERY_HASH = 'lock_recovery_hash';
export const LOCK_RECOVERY_SALT = 'lock_recovery_salt';

export const TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
  { value: 900, label: '15 min' },
  { value: 1800, label: '30 min' },
  { value: -1, label: 'Nunca' },
];
export const DEFAULT_TIMEOUT = 60;

export const LOCK_LABELS: Record<LockType, string> = { pin: 'PIN', password: 'Senha', pattern: 'Padrão' };

export interface LockConfig {
  type: LockType | null;
  hash: string | null;
  salt: string;
  pinLength: number;
  timeout: number;
  biometric: boolean;
  /** Existe um código de recuperação válido. */
  hasRecovery: boolean;
  recoveryHash: string | null;
  recoverySalt: string;
}

export function lockConfig(settings: Setting[]): LockConfig {
  const get = (k: string) => settings.find((s) => s.key === k)?.value;
  const type = get(LOCK_TYPE) as LockType | undefined;
  const hash = get(LOCK_HASH) ?? null;
  const timeout = Number(get(LOCK_TIMEOUT));
  return {
    type: type && hash ? type : null,
    hash,
    salt: get(LOCK_SALT) ?? '',
    pinLength: Number(get(LOCK_PIN_LEN)) || 0,
    timeout: Number.isFinite(timeout) && get(LOCK_TIMEOUT) != null ? timeout : DEFAULT_TIMEOUT,
    biometric: get(LOCK_BIOMETRIC) === '1',
    hasRecovery: !!get(LOCK_RECOVERY_HASH),
    recoveryHash: get(LOCK_RECOVERY_HASH) ?? null,
    recoverySalt: get(LOCK_RECOVERY_SALT) ?? '',
  };
}

export function checkSecret(cfg: LockConfig, secret: string): boolean {
  return !!cfg.hash && sha256(`${cfg.salt}:${secret}`) === cfg.hash;
}

export function saveLock(type: LockType, secret: string) {
  const salt = randomSalt();
  setSetting(LOCK_TYPE, type);
  setSetting(LOCK_SALT, salt);
  setSetting(LOCK_HASH, sha256(`${salt}:${secret}`));
  setSetting(LOCK_PIN_LEN, type === 'pin' ? String(secret.length) : '0');
}

export function removeLock() {
  for (const k of [LOCK_TYPE, LOCK_HASH, LOCK_SALT, LOCK_PIN_LEN, LOCK_BIOMETRIC, LOCK_RECOVERY_HASH, LOCK_RECOVERY_SALT]) deleteSetting(k);
}

function randomSalt() {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- código de recuperação
/** Sem 0/O, 1/I/L: letras e números que não se confundem ao anotar à mão. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Tira espaços, traços e caixa: "k7m2 xq9p" confere com "K7M2-XQ9P". */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Gera um código novo (16 caracteres, ~79 bits) com o gerador seguro do sistema, grava
 * só o hash e devolve o código para ser mostrado uma única vez. O anterior deixa de valer.
 */
export function createRecoveryCode(): string {
  const bytes = Crypto.getRandomBytes(16);
  let raw = '';
  // 248 é o maior múltiplo de 31 abaixo de 256: descarta o resto para não enviesar
  for (const b of bytes) if (b < 248) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  while (raw.length < 16) {
    const b = Crypto.getRandomBytes(1)[0];
    if (b < 248) raw += CODE_ALPHABET[b % CODE_ALPHABET.length];
  }
  raw = raw.slice(0, 16);
  const salt = randomSalt();
  setSetting(LOCK_RECOVERY_SALT, salt);
  setSetting(LOCK_RECOVERY_HASH, sha256(`${salt}:${raw}`));
  return raw.match(/.{4}/g)!.join('-');
}

export function checkRecovery(cfg: LockConfig, code: string): boolean {
  return !!cfg.recoveryHash && sha256(`${cfg.recoverySalt}:${normalizeCode(code)}`) === cfg.recoveryHash;
}

// ---------------------------------------------------------------- saídas rápidas
/**
 * Escolher um arquivo ou um print joga o app para segundo plano por alguns segundos.
 * Quem chama o seletor avisa antes, e a volta não pede a senha.
 */
let paused = false;
export function pauseLock() { paused = true; }
export function takePause() { const p = paused; paused = false; return p; }

// ---------------------------------------------------------------- SHA-256
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256 de uma string (UTF-8), em hexadecimal. */
export function sha256(text: string): string {
  const bytes = Array.from(unescape(encodeURIComponent(text)), (c) => c.charCodeAt(0));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
