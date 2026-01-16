async function fetchStores(){
  const res=await fetch('/api/stores');
  const data=await res.json();
  const table=document.getElementById('storesTable');
  table.innerHTML='<tr><th>اسم</th><th>نوع</th><th>منشن الكل</th><th>منشن هنا</th><th>منشن المتاجر</th><th>استخدام</th></tr>';
  data.forEach(s=>{
    const row=document.createElement('tr');
    row.innerHTML=`<td>${s.name}</td><td>${s.type}</td><td>${s.mentionEveryone}</td><td>${s.mentionHere}</td><td>${s.mentionStores}</td>
    <td>
      <button onclick="useMention(${s.id},'mentionEveryone')">+ALL</button>
      <button onclick="useMention(${s.id},'mentionHere')">+HERE</button>
      <button onclick="useMention(${s.id},'mentionStores')">+STORES</button>
    </td>`;
    table.appendChild(row);
  });
}

async function fetchLogs(){
  const res=await fetch('/api/logs');
  const data=await res.json();
  const table=document.getElementById('logsTable');
  table.innerHTML='<tr><th>الوقت</th><th>العملية</th><th>المتجر</th><th>المستخدم</th><th>ID</th><th>تفاصيل</th></tr>';
  data.forEach(l=>{
    const row=document.createElement('tr');
    row.innerHTML=`<td>${l.time}</td><td>${l.action}</td><td>${l.store}</td><td>${l.discordName}</td><td>${l.discordId}</td><td>${l.details}</td>`;
    table.appendChild(row);
  });
}

async function createStore(){
  const name=document.getElementById('storeName').value;
  const type=document.getElementById('storeType').value;
  if(!name)return alert('اكتب اسم المتجر');
  const res=await fetch('/api/store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',data:{name,type}})});
  const data=await res.json();
  if(data.ok){alert('✅ تم إنشاء المتجر'); fetchStores(); fetchLogs(); }
  else alert('❌ '+data.msg);
}

async function useMention(id,field){
  const res=await fetch('/api/store',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'useMention',data:{id,field,amount:100}})});
  const data=await res.json();
  if(data.ok){alert('✅ تم استخدام المنشن'); fetchStores(); fetchLogs(); }
  else alert('❌ '+data.msg);
}

fetchStores();
fetchLogs();
setInterval(()=>{fetchStores();fetchLogs();},10000);
