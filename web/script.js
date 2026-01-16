const addForm = document.getElementById('addStoreForm');
addForm.addEventListener('submit', e=>{
  e.preventDefault();
  const data = {name:e.target.name.value, type:e.target.type.value};
  fetch('/api/store',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({action:'create', data})
  }).then(r=>r.json()).then(d=>{
    if(d.ok) alert('✅ تم إنشاء المتجر'); fetchLogs();
  });
});

function fetchLogs(){
  fetch('/api/logs').then(r=>r.json()).then(logs=>{
    const table = document.getElementById('logTable');
    table.innerHTML='<tr><th>الوقت</th><th>الإجراء</th><th>المتجر</th><th>الأدمن</th><th>ID</th><th>التفاصيل</th></tr>';
    logs.forEach(l=>{
      const row = table.insertRow();
      row.insertCell(0).innerText=l.time;
      row.insertCell(1).innerText=l.action;
      row.insertCell(2).innerText=l.store;
      row.insertCell(3).innerText=l.discordName;
      row.insertCell(4).innerText=l.discordId;
      row.insertCell(5).innerText=l.details;
    });
  });
}

fetchLogs();
