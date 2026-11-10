import Link from "next/link";
import Logo from "@/components/Logo";
import { ORG, PDPA_VERSION } from "@/lib/pdpa";

export const metadata = { title: "นโยบายความเป็นส่วนตัว | วิทยาลัยการอาชีพโพนทอง" };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. ข้อมูลส่วนบุคคลที่เก็บรวบรวม",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>ผู้ใช้งานทุกคน:</b> ชื่อ-สกุล อีเมล รหัสผ่าน (เข้ารหัส ผู้ดูแลระบบมองไม่เห็น) บทบาทการใช้งาน วันเวลาที่ให้ความยินยอม</li>
        <li><b>ครูผู้สอน:</b> รหัสครู แผนกวิชา ภาระงานสอน ตารางสอน และเวลาที่ไม่สะดวกสอน</li>
        <li><b>นักเรียน นักศึกษา:</b> กลุ่มเรียน และตารางเรียนของกลุ่ม</li>
      </ul>
    ),
  },
  {
    title: "2. วัตถุประสงค์การใช้ข้อมูล",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>จัดทำ เผยแพร่ และปรับปรุงตารางเรียน ตารางสอน และการใช้ห้องเรียน</li>
        <li>ยืนยันตัวตนและกำหนดสิทธิ์การเข้าใช้งานระบบ</li>
        <li>บริหารภาระงานสอนตามระเบียบของสถานศึกษา</li>
      </ul>
    ),
  },
  {
    title: "3. ฐานทางกฎหมาย",
    body: <p>อาศัยการปฏิบัติหน้าที่ตามภารกิจของสถานศึกษา (มาตรา 24(4) พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562) และความยินยอมของเจ้าของข้อมูล (มาตรา 19)</p>,
  },
  {
    title: "4. การเปิดเผยและการเก็บรักษา",
    body: (
      <>
        <p>ข้อมูลไม่ถูกขายหรือเปิดเผยแก่บุคคลภายนอก ตารางที่เผยแพร่แล้วแสดงเฉพาะต่อผู้ใช้ที่ล็อกอินในระบบ
          ข้อมูลจัดเก็บบนบริการคลาวด์ (Supabase) โดยมีการเข้ารหัสระหว่างการรับส่ง และจำกัดสิทธิ์ตามบทบาทผู้ใช้</p>
        <p className="mt-2">ระยะเวลาเก็บรักษา: {ORG.retention}</p>
      </>
    ),
  },
  {
    title: "5. สิทธิของเจ้าของข้อมูล",
    body: (
      <>
        <p>ท่านมีสิทธิขอเข้าถึงและขอรับสำเนา ขอแก้ไข ขอลบ ขอระงับการใช้ คัดค้าน และถอนความยินยอมเมื่อใดก็ได้</p>
        <p className="mt-2">ยื่นคำร้องได้ที่เมนู <b>“PDPA / ข้อมูลส่วนบุคคล”</b> หลังเข้าสู่ระบบ หรือติดต่อ {ORG.dpoContact}
          วิทยาลัยจะดำเนินการภายใน 30 วันนับแต่ได้รับคำร้อง</p>
      </>
    ),
  },
  {
    title: "6. ผู้ควบคุมข้อมูลส่วนบุคคล",
    body: <p>{ORG.name} {ORG.address} — ติดต่อ: {ORG.dpoContact}</p>,
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-8">
      <div className="card flex items-center gap-4">
        <Logo size={72} />
        <div>
        <h1 className="page-title">นโยบายความเป็นส่วนตัว (Privacy Notice)</h1>
        <p className="text-sm text-slate-500">
          ระบบจัดตารางเรียน-ตารางสอน {ORG.name} · ฉบับที่ {PDPA_VERSION}
        </p>
        </div>
      </div>
      {SECTIONS.map((s) => (
        <section key={s.title} className="card text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{s.title}</h2>
          {s.body}
        </section>
      ))}
      <p className="text-center text-sm"><Link href="/" className="link">← กลับสู่ระบบ</Link></p>
    </div>
  );
}
