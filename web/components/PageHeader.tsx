/** หัวข้อหน้า: ชื่อหน้า + คำอธิบาย + ปุ่มด้านขวา */
export default function PageHeader({ title, subtitle, badge, actions }: {
  title: React.ReactNode; subtitle?: React.ReactNode; badge?: React.ReactNode; actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
