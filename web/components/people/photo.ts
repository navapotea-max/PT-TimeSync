import { clearAvatarCache } from "@/components/Avatar";
import { createClient } from "@/lib/supabase/client";

/** ย่อรูปเป็น JPEG ขนาดไม่เกิน 512px เพื่อประหยัดพื้นที่ และตัดข้อมูล EXIF (เช่น พิกัด GPS) ออก */
async function shrink(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", 0.85));
}

/**
 * อัปโหลดรูปโปรไฟล์ไปที่ avatars/<kind>/<id>
 * - ผู้ดูแลระบบ: อัปเดตคอลัมน์ photo_path โดยตรง
 * - เจ้าของข้อมูล: ใช้ RPC set_my_photo (ฐานข้อมูลตรวจว่าเป็น path ของตนเอง)
 */
export async function uploadProfilePhoto(kind: "teachers" | "students", id: string, file: File, asAdmin: boolean) {
  if (!file.type.startsWith("image/")) throw new Error("กรุณาเลือกไฟล์รูปภาพ");
  if (file.size > 10 * 1024 * 1024) throw new Error("ไฟล์ใหญ่เกิน 10 MB");
  const sb = createClient();
  const path = `${kind}/${id}`;
  const blob = await shrink(file);
  const up = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  const res = asAdmin
    ? await sb.from(kind).update({ photo_path: path }).eq("id", id)
    : await sb.rpc("set_my_photo", { p_path: path });
  if (res.error) throw new Error(res.error.message);
  clearAvatarCache(path);
  return path;
}
