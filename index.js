// ==== IMPORTS ====
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

// ==== ENVIRONMENT VARIABLES ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;

// ==== ENSURE DATA FOLDER ====
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
  console.log('📁 تم إنشاء مجلد data تلقائيًا');
}

// ==== SQLITE DATABASE ====
const db = new sqlite3.Database(path.join(dataPath, 'database.sqlite'), (err) => {
  if (err) return console.error('❌ خطأ بقاعدة البيانات:', err.message);
  console.log('✅ قاعدة البيانات SQLite جاهزة');
});

// إنشاء جدول المتاجر وLog إذا لم يكن موجود
db.run(`CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner TEXT,
  name TEXT,
  type TEXT,
  mentionEveryone INTEGER,
  mentionHere INTEGER,
  mentionStores INTEGER
)`);
db.run(`CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT,
  action TEXT,
  store TEXT,
  discordName TEXT,
  discordId TEXT,
  details TEXT
)`);

// ==== DISCORD CLIENT ====
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ==== SHOP ENCRYPTION ====
const shopEncryptMap = {
  "سعر": "س3ر",
  "تبادل": "تbادل",
  "متوفر": "مت9فر",
  "مطلوب": "مطل9ب",
  "عرض": "3رض",
  "عروضكم": "3ر9ضكم",
  "عرضك": "3رضك",
  "رصيد": "ر9يد",
  "طلب": "طلb",
  "رصيدك": "ر9يدك",
  "رصيدكم": "ر9يدكم",
  "طلبات": "طلbات",
  "خاص": "خا9"
};
function encryptText(text) {
  return text.split(' ').map(w => shopEncryptMap[w] || w).join(' ');
}
function decryptText(text) {
  const reverse = {};
  for (const k in shopEncryptMap) reverse[shopEncryptMap[k]] = k;
  return text.split(' ').map(w => reverse[w] || w).join(' ');
}

// ==== EXPRESS APP ====
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// ==== SESSIONS ====
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataPath }),
  secret: 'super-secret',
  resave: false,
  saveUninitialized: false
}));

// ==== OAUTH2 LOGIN ====
app.get('/auth/login', (req, res) => {
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ لا يوجد كود OAuth2');

  // تبادل الكود للحصول على التوكن
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }).then(r => r.json());

  const userData = await fetch('https://discord.com/api/users/@me', {
    headers: { 'Authorization': `Bearer ${tokenRes.access_token}` }
  }).then(r => r.json());

  req.session.user = userData;
  res.redirect('/dashboard.html');
});

// ==== API ENDPOINTS ====
app.get('/api/stores', (req, res) => {
  db.all(`SELECT * FROM stores`, (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

app.get('/api/logs', (req, res) => {
  db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`, (err, rows) => {
    if (err) return res.json([]);
    res.json(rows);
  });
});

app.post('/api/store', (req, res) => {
  const { action, data } = req.body;
  const user = req.session.user;
  if (!user) return res.json({ ok: false, msg: '❌ يجب تسجيل الدخول' });

  if (action === 'create') {
    db.run(`INSERT INTO stores(owner,name,type,mentionEveryone,mentionHere,mentionStores)
      VALUES(?,?,?,?,?,?)`, [user.id, data.name, data.type, 0,0,0], function(err){
        if(err) return res.json({ ok:false, msg: err.message });
        // سجل العملية
        db.run(`INSERT INTO logs(time,action,store,discordName,discordId,details)
          VALUES(?,?,?,?,?,?)`,
          [new Date().toLocaleString(), 'إنشاء متجر', data.name, user.username, user.id, `الفئة: ${data.type}`]);
        res.json({ ok:true });
    });
  } else if(action === 'useMention'){
    const { id, field, amount } = data;
    db.get(`SELECT * FROM stores WHERE id=?`, [id], (err, store) => {
      if(!store) return res.json({ ok:false, msg:'❌ المتجر غير موجود' });
      if(store[field] + amount > 30000) return res.json({ ok:false, msg:'❌ الحد الأقصى للمنشنات 30k' });
      db.run(`UPDATE stores SET ${field}=? WHERE id=?`, [store[field]+amount, id]);
      db.run(`INSERT INTO logs(time,action,store,discordName,discordId,details)
        VALUES(?,?,?,?,?,?)`,
        [new Date().toLocaleString(), 'استخدام منشن', store.name, user.username, user.id, `نوع: ${field} +${amount}`]);
      res.json({ ok:true });
    });
  } else res.json({ ok:false, msg:'❌ أمر غير معروف' });
});

// ==== START EXPRESS ====
app.get('/', (req,res) => res.send('✅ Discord Shop Bot running'));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ==== DISCORD BOT COMMANDS ====
const commands = [
  new SlashCommandBuilder().setName('تشفير').setDescription('تشفير نص حسب كلمات الشوبات').addStringOption(o => o.setName('النص').setDescription('اكتب النص المراد تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('فك_تشفير').setDescription('فك نص مشفر للشوبات').addStringOption(o => o.setName('النص').setDescription('اكتب النص المراد فك تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('عرض جميع أوامر البوت')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ تم تسجيل أوامر البوت');
})();

client.on('interactionCreate', async interaction => {
  if(!interaction.isChatInputCommand()) return;
  if(interaction.guild) return interaction.reply({ content:'❌ هذه الأوامر تعمل في الخاص فقط', ephemeral:true });

  const cmd = interaction.commandName;
  if(cmd === 'تشفير'){
    const text = interaction.options.getString('النص');
    await interaction.reply({ content: encryptText(text) });
  } else if(cmd === 'فك_تشفير'){
    const text = interaction.options.getString('النص');
    await interaction.reply({ content: decryptText(text) });
  } else if(cmd === 'help'){
    const embed = new EmbedBuilder()
      .setTitle('📜 قائمة أوامر البوت')
      .setColor('Blue')
      .setDescription(`
/تشفير <النص> → تشفير نص  
/فك_تشفير <النص> → فك نص مشفر
      `);
    await interaction.reply({ embeds:[embed] });
  } else {
    await interaction.reply({ content:'⚠️ هذا الأمر غير معرف', ephemeral:true });
  }
});

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(TOKEN);
