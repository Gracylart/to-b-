export const SKINS = Object.freeze([
  Object.freeze({id:'apple',name:'苹果浅色',theme:'light',color:'#f4f8fc'}),
  Object.freeze({id:'blue',name:'经典蓝',theme:'dark',color:'#26364b'}),
  Object.freeze({id:'claude',name:'Quiet Blue',theme:'dark',color:'#222d38'}),
]);

export function normalizeSkin(value) {
  return SKINS.some(s=>s.id===value)?value:'apple';
}

export function applySkin(value,root=document.documentElement) {
  const skin=SKINS.find(s=>s.id===normalizeSkin(value));
  root.dataset.skin=skin.id;
  root.dataset.theme=skin.theme;
  root.querySelector('meta[name="theme-color"]')?.setAttribute('content',skin.color);
  return skin.id;
}
