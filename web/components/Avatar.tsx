"use client";

import { useEffect, useState } from "react";
import { usePrivacy } from "@/components/Preferences";
import { createClient } from "@/lib/supabase/client";

/* รูปเก็บใน bucket ส่วนตัว "avatars" → ขอ signed URL (อายุ 1 ชม.) และแคชไว้ในหน่วยความจำ */
const cache = new Map<string, { url: string; exp: number }>();
const pending = new Map<string, Promise<string | null>>();

export async function signedAvatarUrl(path: string, version?: string): Promise<string | null> {
  const key = `${path}|${version ?? ""}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.url;
  if (pending.has(key)) return pending.get(key)!;
  const p = createClient().storage.from("avatars").createSignedUrl(path, 3600)
    .then(({ data }) => {
      pending.delete(key);
      if (!data?.signedUrl) return null;
      cache.set(key, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
      return data.signedUrl;
    });
  pending.set(key, p);
  return p;
}

export function clearAvatarCache(path: string) {
  Array.from(cache.keys()).filter((k) => k.startsWith(path + "|")).forEach((k) => cache.delete(k));
}

const COLORS = ["bg-brand-100 text-brand-800", "bg-amber-100 text-amber-800", "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800"];

const TITLE = /^(ครู|นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)/;

export default function Avatar({ name, path, version, size = 40, className = "" }: {
  name: string | null | undefined; path?: string | null; version?: string; size?: number; className?: string;
}) {
  const privacy = usePrivacy();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (path && !privacy.enabled) signedAvatarUrl(path, version).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [path, version, privacy.enabled]);

  const clean = (name ?? "").replace(TITLE, "").trim();
  const initial = privacy.enabled ? "•" : Array.from(clean)[0] ?? "?";
  const color = COLORS[Array.from(clean).reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.4) };

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name ?? ""} style={style} onError={() => setUrl(null)} className={`shrink-0 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 ${className}`} />;
  }
  return (
    <span style={style} aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${color} dark:bg-slate-700 dark:text-slate-100 ${className}`}>
      {initial}
    </span>
  );
}
