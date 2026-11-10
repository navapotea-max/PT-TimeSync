"use client";

/** ส่วนประกอบย่อยของหน้าโปรไฟล์ */
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="card-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function InfoGrid({ items }: { items: { label: string; value: React.ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{it.label}</dt>
          <dd className={`mt-0.5 break-words text-sm text-slate-900 dark:text-slate-100 ${it.mono ? "font-mono" : ""}`}>
            {it.value === null || it.value === undefined || it.value === "" ? <span className="text-slate-300 dark:text-slate-600">—</span> : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
