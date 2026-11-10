export const THEME_KEY = "pt-theme";

/** สคริปต์ที่ฝังใน <head> เพื่อให้ธีมถูกต้องตั้งแต่เฟรมแรก (ไม่กระพริบ) — ค่าเริ่มต้นคือโหมดสว่าง */
export const themeInitScript = `(function(){try{if(localStorage.getItem('${THEME_KEY}')==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;
