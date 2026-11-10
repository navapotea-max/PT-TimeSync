export const THEME_KEY = "pt-theme";

/** สคริปต์ที่ฝังใน <head> เพื่อให้ธีมถูกต้องตั้งแต่เฟรมแรก (ไม่กระพริบ) */
export const themeInitScript = `(function(){try{var c=localStorage.getItem('${THEME_KEY}')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;
