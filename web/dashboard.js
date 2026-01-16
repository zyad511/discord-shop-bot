const addForm = document.getElementById('addStoreForm');
const storesContainer = document.getElementById('storesContainer');
const logTableBody = document.querySelector('#logTable tbody');

addForm.addEventListener('submit', e => {
  e.preventDefault();
  const data = { name: e.target.name.value, type: e.target.type.value };
  fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', data })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      alert('✅ تم إنشاء المتجر');
      e.target.reset();
      fetchStores();
      fetchLogs();
    }
  });
});

function fetchStores() {
  fetch('/api/stores') // هذا API جديد يرجع كل المتاجر
    .then(r => r.json())
    .then(stores => {
      storesContainer.innerHTML = '';
      stores.forEach(store => {
        const card = document.createElement('div');
        card.className = 'card bg-gray-700 p-4 shadow-md rounded-xl';
        card.innerHTML = `
          <h3 class="text-xl font-bold mb-2">${store.name}</h3>
          <p>الفئة: <span class="font-semibold">${store.type}</span></p>
          <p>منشن الكل: ${store.mentionEveryone}</p>
          <p>منشن هنا: ${store.mentionHere}</p>
          <p>منشن المتاجر: ${store.mentionStores}</p>
          <button class="btn btn-warning mt-2" onclick="useMention('${store.id}','mentionEveryone')">استخدام منشن الكل</button>
        `;
        storesContainer.appendChild(card);
      });
    });
}

function useMention(id, field) {
  fetch('/api/store', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'useMention', data: { id, field, amount: 1 } })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      alert('✅ تم استخدام المنشن');
      fetchStores();
      fetchLogs();
    } else alert('❌ ' + d.msg);
  });
}

function fetchLogs() {
  fetch('/api/logs').then(r => r.json()).then(logs => {
    logTableBody.innerHTML = '';
    logs.forEach(l => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${l.time}</td>
        <td>${l.action}</td>
        <td>${l.store}</td>
        <td>${l.discordName}</td>
        <td>${l.discordId}</td>
        <td>${l.details}</td>
      `;
      logTableBody.appendChild(row);
    });
  });
}

// أول تحميل
fetchStores();
fetchLogs();
