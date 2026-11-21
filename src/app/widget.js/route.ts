// Floating corner status widget for any website:
//   <script src="https://statusreport.roleflow.site/widget.js" data-page="acme" async></script>
import { env } from "@/lib/env";

export const dynamic = "force-static";

const SCRIPT = (appUrl: string) => `(function(){
  var s=document.currentScript||document.querySelector('script[data-page][src*="widget.js"]');
  if(!s)return;var slug=s.getAttribute('data-page');if(!slug)return;
  var pos=s.getAttribute('data-position')||'bottom-right';
  var base=${JSON.stringify(appUrl)}+'/s/'+encodeURIComponent(slug);
  var C={none:'#22C55E',minor:'#F59E0B',major:'#F97316',critical:'#EF4444',maintenance:'#3B82F6'};
  fetch(base+'/status.json').then(function(r){return r.json()}).then(function(d){
    var ind=d.status.indicator;var color=C[ind]||'#5E6372';
    var a=document.createElement('a');a.href=d.page.url||base;a.target='_blank';a.rel='noopener';
    var v=pos.indexOf('top')===0?'top:16px;':'bottom:16px;';var h=pos.indexOf('left')>-1?'left:16px;':'right:16px;';
    a.setAttribute('style','position:fixed;'+v+h+'z-index:2147483000;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:#13161F;color:#E6E8EE;border:1px solid rgba(255,255,255,.1);font:500 13px/1 Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.35)');
    a.innerHTML='<span style="width:9px;height:9px;border-radius:9px;background:'+color+';box-shadow:0 0 0 4px '+color+'33"></span>';
    a.appendChild(document.createTextNode(d.status.description));
    document.body.appendChild(a);
  }).catch(function(){});
})();`;

export function GET() {
  return new Response(SCRIPT(env.appUrl), {
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
