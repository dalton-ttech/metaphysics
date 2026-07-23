import { createHash } from "node:crypto";

export function sha256(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(text).digest("hex");
}

export function fnv1a32(value) {
  const text = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mix32(value) {
  let output = value >>> 0;
  output ^= output >>> 16;
  output = Math.imul(output, 0x7feb352d);
  output ^= output >>> 15;
  output = Math.imul(output, 0x846ca68b);
  output ^= output >>> 16;
  return output >>> 0;
}

export function unitFromIntegers(...values) {
  let state = 0x9e3779b9;
  for (const value of values) state = mix32(state ^ (Number(value) >>> 0));
  return state / 0x100000000;
}

export function integerFromKey(key, modulus) {
  return mix32(fnv1a32(key)) % modulus;
}

export function createDeterministicRandom(key) {
  let state = mix32(fnv1a32(key));
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let output = state;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 0x100000000;
  };
}

export function parity(value) {
  let bits = value >>> 0;
  bits ^= bits >>> 16;
  bits ^= bits >>> 8;
  bits ^= bits >>> 4;
  bits &= 0xf;
  return (0x6996 >>> bits) & 1;
}

export function jaccard(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}
