function makeDb(){
  const K='rm-data',subs=[];
  const ls=()=>{try{return JSON.parse(localStorage.getItem(K))||{}}catch(e){return{}}};
  const put=d=>{localStorage.setItem(K,JSON.stringify(d));subs.forEach(f=>f())};
  const col=name=>{
    let ord=null;
    const c={
      orderBy(f,dir){ord=[f,dir];return c},
      onSnapshot(cb){
        const run=()=>{
          const a=Object.entries(ls()[name]||{}).map(([id,v])=>({id,data:()=>v}));
          if(ord)a.sort((x,y)=>(ord[1]==='desc'?-1:1)*((x.data()[ord[0]]||0)-(y.data()[ord[0]]||0)));
          cb({docs:a});
        };
        subs.push(run);run();
      },
      async add(v){const d=ls();d[name]=d[name]||{};d[name][Date.now().toString(36)+Math.random().toString(36).slice(2,6)]=v;put(d)}
    };
    return c;
  };
  return{
    collection:col,
    doc(path){const[n,id]=path.split('/');return{
      async set(v){const d=ls();d[n]=d[n]||{};d[n][id]=v;put(d)},
      async update(v){const d=ls();d[n]=d[n]||{};d[n][id]={...d[n][id],...v};put(d)},
      async delete(){const d=ls();if(d[n])delete d[n][id];put(d)}
    }}
  };
}

const ADMIN={email:'admin@sekolah.id',nama:'Administrator',role:'admin',hash:'606b4205e6a4b532f99a05b82d45ec2c8688ed72d791876b18ec520722a4f80b'};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hue=s=>{let h=0;for(const c of String(s))h=(h*31+c.charCodeAt(0))%360;return h};
const L={siswa:'Siswa',guru:'Guru',admin:'Admin'};
let db=null,accts={},mats=[],cur=null,authTab='login',tab='home',mapel='Semua',q='',form=null,loaded=0,failed=false,msg='';

const hash=async(e,p)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('rm1:'+e+':'+p)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const save=e=>{try{sessionStorage.setItem('rm-user',e||'')}catch(x){}};
const saved=()=>{try{return sessionStorage.getItem('rm-user')||''}catch(x){return''}};
const canEdit=m=>cur&&(cur.role==='admin'||m.authorEmail===cur.email);

async function init(){
  setTimeout(()=>{if(loaded<2){failed=true;render()}},10000);
  try{
    db=makeDb();
    db.collection('accounts').onSnapshot(s=>{accts={};s.docs.forEach(d=>accts[d.id]=d.data());loaded|=1;restore();render()},()=>{failed=true;render()});
    db.collection('materi').orderBy('createdAt','desc').onSnapshot(s=>{mats=s.docs.map(d=>({id:d.id,...d.data()}));loaded|=2;render()},()=>{failed=true;render()});
  }catch(e){failed=true;render()}
}
function restore(){
  const e=saved();if(!e)return;
  if(e===ADMIN.email){cur=ADMIN;return}
  if(accts[e])cur={...accts[e],email:e};else if(cur&&cur.role!=='admin')cur=null;
}

function render(){
  const a=$('#app');
  $('#who').innerHTML=cur?esc(cur.nama)+'<span class="badge">'+L[cur.role]+'</span>':'';
  $('#out').hidden=!cur;
  const nv=$('#nav');
  if(failed&&loaded<3&&!cur){nv.hidden=true;a.innerHTML='<div class="empty">Data belum bisa dimuat. Coba muat ulang halaman.</div>';return}
  if(loaded<3){nv.hidden=true;a.innerHTML='<div class="empty">Memuat…</div>';return}
  if(!cur){nv.hidden=true;a.innerHTML=authView();return}
  const tabs=cur.role==='siswa'?[['home','Materi saya']]:cur.role==='guru'?[['home','Beranda guru'],['tambah',form&&form.id?'Ubah materi':'Tambah materi'],['semua','Semua materi']]:[['home','Semua materi'],['pengguna','Pengguna']];
  if(!tabs.some(t=>t[0]===tab))tab='home';
  nv.hidden=tabs.length<2;
  nv.innerHTML=tabs.map(t=>`<button data-t="${t[0]}" aria-current="${tab===t[0]}">${t[1]}</button>`).join('');
  a.innerHTML=tab==='tambah'?formView():tab==='pengguna'?usersView():cur.role==='siswa'?studentHome():cur.role==='guru'&&tab==='home'?teacherHome():listView(mats,'Semua materi',true);
}

function authView(){
  const reg=authTab==='register';
  return `<div class="auth"><h2>${reg?'Buat akun':'Masuk'}</h2>
  <p class="meta">${reg?'Daftar sebagai siswa atau guru, lalu masuk dengan email dan kata sandi Anda.':'Masuk untuk melihat materi pelajaran.'}</p>
  <form id="af">
   ${reg?'<label>Nama lengkap<input name="nama" required autocomplete="name"></label>':''}
   <label>Email<input name="email" type="email" required autocomplete="email"></label>
   <label>Kata sandi<input name="pw" type="password" required minlength="6" autocomplete="${reg?'new-password':'current-password'}"></label>
   ${reg?'<div class="seg"><label><input type="radio" name="role" value="siswa" checked>Siswa</label><label><input type="radio" name="role" value="guru">Guru</label></div>':''}
   <div class="err" role="alert">${esc(msg)}</div>
   <button class="btn" type="submit">${reg?'Daftar':'Masuk'}</button>
  </form>
  <button class="chip" data-a="${reg?'login':'register'}">${reg?'Sudah punya akun? Masuk':'Belum punya akun? Daftar'}</button></div>`;
}

function cards(list,manage){
  if(!list.length)return '<div class="empty">Belum ada materi yang cocok.</div>';
  return '<div class="grid">'+list.map(m=>`<article class="m" style="--h:${hue(m.mapel||'')}"><div class="sp">${esc(m.mapel)}</div><div class="bd">
   <h3>${esc(m.judul)}</h3><div class="meta">Kelas ${esc(m.kelas)} · oleh ${esc(m.authorName||'Guru')}</div>
   ${m.isi?`<p>${esc(m.isi)}</p>`+(m.isi.length>140?'<button class="btn ghost" data-o="1" style="margin-bottom:8px">Baca selengkapnya</button>':''):''}
   ${/^https?:\/\//.test(m.link||'')?`<a href="${esc(m.link)}" target="_blank" rel="noopener">Buka tautan materi</a>`:''}
   ${manage&&canEdit(m)?`<div class="act"><button class="btn ghost" data-e="${m.id}">Ubah</button><button class="btn del" data-d="${m.id}">Hapus</button></div>`:''}
  </div></article>`).join('')+'</div>';
}
function filters(list){
  const subs=['Semua',...new Set(list.map(m=>m.mapel).filter(Boolean))];
  if(!subs.includes(mapel))mapel='Semua';
  return `<div class="bar"><input id="q" placeholder="Cari judul materi" value="${esc(q)}" style="max-width:260px">${subs.map(s=>`<button class="chip" data-f="${esc(s)}" aria-pressed="${s===mapel}">${esc(s)}</button>`).join('')}</div>`;
}
const flt=l=>l.filter(m=>(mapel==='Semua'||m.mapel===mapel)&&(!q||(m.judul||'').toLowerCase().includes(q.toLowerCase())));
function studentHome(){return `<h2 style="margin-bottom:14px">Halo, ${esc(cur.nama.split(' ')[0])}</h2>`+filters(mats)+cards(flt(mats),false)}
function teacherHome(){
  const mine=mats.filter(m=>m.authorEmail===cur.email);
  return `<h2 style="margin-bottom:14px">Beranda guru</h2><div class="stat"><div><b>${mine.length}</b>materi saya</div><div><b>${new Set(mine.map(m=>m.mapel)).size}</b>mata pelajaran</div></div>
  <div class="bar"><button class="btn" data-t="tambah">Tambah materi</button></div>`+
  (mine.length?cards(mine,true):'<div class="empty">Anda belum menambahkan materi. Mulai dengan “Tambah materi”.</div>');
}
function listView(list,title,manage){return `<h2 style="margin-bottom:14px">${title}</h2>`+filters(list)+cards(flt(list),manage)}
function formView(){
  const f=form||{};
  return `<h2 style="margin-bottom:14px">${f.id?'Ubah materi':'Tambah materi'}</h2>
  <form id="mf"><label>Judul<input name="judul" required value="${esc(f.judul)}"></label>
  <div class="two"><label>Mata pelajaran<input name="mapel" required value="${esc(f.mapel)}" placeholder="Contoh: Matematika"></label>
  <label>Kelas<input name="kelas" required value="${esc(f.kelas)}" placeholder="Contoh: 8A"></label></div>
  <label>Isi materi<textarea name="isi" rows="7">${esc(f.isi)}</textarea></label>
  <label>Tautan (opsional)<input name="link" type="url" value="${esc(f.link)}" placeholder="https://"></label>
  <div class="act"><button class="btn" type="submit">Simpan materi</button>${f.id?'<button class="btn ghost" type="button" id="cx">Batal</button>':''}</div></form>`;
}
function usersView(){
  const rows=Object.keys(accts).map(id=>{const u=accts[id];return `<div class="row"><span><b>${esc(u.nama)}</b><br><span class="meta">${esc(id)}</span></span>
   <span><select data-r="${esc(id)}"><option value="siswa"${u.role==='siswa'?' selected':''}>Siswa</option><option value="guru"${u.role==='guru'?' selected':''}>Guru</option></select>
   <button class="btn del" data-x="${esc(id)}">Hapus akun</button></span></div>`}).join('');
  return `<h2 style="margin-bottom:14px">Pengguna</h2>${rows||'<div class="empty">Belum ada yang mendaftar.</div>'}`;
}

document.addEventListener('click',async e=>{
  if(e.target.id==='out'){cur=null;save('');authTab='login';tab='home';return render()}
  const t=e.target.closest('button');if(!t)return;const g=k=>t.dataset[k];
  try{
    if(g('a')){authTab=g('a');msg='';render()}
    else if(g('t')){tab=g('t');if(tab!=='tambah')form=null;render()}
    else if(g('f')!==undefined){mapel=g('f');render()}
    else if(g('o')){const p=t.previousElementSibling;p.classList.toggle('open');t.textContent=p.classList.contains('open')?'Tutup':'Baca selengkapnya'}
    else if(g('e')){form=mats.find(m=>m.id===g('e'));tab='tambah';render();scrollTo(0,0)}
    else if(g('d')){const m=mats.find(x=>x.id===g('d'));if(confirm('Hapus materi “'+m.judul+'”?'))await db.doc('materi/'+m.id).delete()}
    else if(g('x')){if(confirm('Hapus akun ini?'))await db.doc('accounts/'+g('x')).delete()}
    else if(t.id==='cx'){form=null;tab='home';render()}
  }catch(err){alert('Gagal: '+(err.message||err.code||'coba lagi'))}
});
document.addEventListener('input',e=>{if(e.target.id==='q'){q=e.target.value;const p=e.target.selectionStart;render();const n=$('#q');n.focus();n.setSelectionRange(p,p)}});
document.addEventListener('change',async e=>{
  const s=e.target.closest('select[data-r]');
  if(s)try{await db.doc('accounts/'+s.dataset.r).update({role:s.value})}catch(err){alert('Gagal mengubah peran')}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();
  try{
    if(e.target.id==='af'){
      const d=Object.fromEntries(new FormData(e.target));const em=d.email.trim().toLowerCase();const h=await hash(em,d.pw);
      if(authTab==='register'){
        if(em===ADMIN.email||accts[em]){msg='Email ini sudah terdaftar.';return render()}
        await db.doc('accounts/'+em).set({nama:d.nama.trim(),role:d.role==='guru'?'guru':'siswa',hash:h,createdAt:Date.now()});
        cur={nama:d.nama.trim(),role:d.role,email:em};
      }else{
        const u=em===ADMIN.email?ADMIN:accts[em];
        if(!u||u.hash!==h){msg='Email atau kata sandi salah.';return render()}
        cur={...u,email:em};
      }
      save(em);msg='';tab='home';render();
    }else if(e.target.id==='mf'){
      const d=Object.fromEntries(new FormData(e.target));
      if(form&&form.id)await db.doc('materi/'+form.id).update(d);
      else await db.collection('materi').add({...d,authorEmail:cur.email,authorName:cur.nama,createdAt:Date.now()});
      form=null;tab='home';render();
    }
  }catch(err){alert('Gagal: '+(err.message||err.code||'coba lagi'))}
});
init();render();