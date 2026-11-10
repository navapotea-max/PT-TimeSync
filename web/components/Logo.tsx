import Image from "next/image";

/** โลโก้วิทยาลัยการอาชีพโพนทอง (ไฟล์: public/logo.png) */
export default function Logo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <Image src="/logo.png" alt="ตราวิทยาลัยการอาชีพโพนทอง" width={size} height={size} priority
      className={`shrink-0 rounded-full ${className}`} />
  );
}
