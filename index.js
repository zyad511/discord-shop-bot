const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/* ================= CONFIG ================= */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

/* ================= BOT ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================= DATABASE ================= */
const db = new sqlite3.Database('./data/database.sqlite');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    mentionEveryone INTEGER,
    mentionHere INTEGER,
    mentionStores INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    time TEXT,
    action TEXT,
    store TEXT,
    discordName TEXT,
    discordId TEXT,
    details TEXT
  )`);
});

/* ================= ENCRYPTION ================= */
const shopEncryptMap = {
  "سعر":"س3ر","تبادل":"تbادل","متوفر":"مت9فر","مطلوب":"مطل9ب","عرض":"3رض",
  "رصيد":"ر9يد","طلب":"طلb"
};
const encryptText = t=>t.split(' ').map(w=>shopEncryptMap[w]||w).join(' ');
const decryptText = t=>{const r={}; for(const k in shopEncryptMap) r[shopEncryptMap[k]]=k; return t.split(' ').map(w=>r[w]||w).join(' ')};

/* ================= SLASH COMMANDS ================= */
const commands = [
  new SlashCommandBuilder().setName('تشفير').setDescription('تشفير نص (خاص فقط)').addStringOption(o=>o.setName('النص').setRequired(true)),
  new SlashCommandBuilder().setName('فك_تشفير').setDescription('فك تشفير نص (خاص فقط)').addStringOption(o=>o.setName('النص').setRequired(true))
].map(c=>c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async ()=>{ await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); console.log('✅ Slash commands registered'); })();

/* ================= BOT INTERACTIONS ================= */
client.on('interactionCreate', async interaction=>{
  if(!interaction.isChatInputCommand()) return;
  if(interaction.guild) return interaction.reply({content:'❌ هذا الأمر يعمل في الخاص فقط', ephemeral:true});
  const text = interaction.options.getString('النص');
  if(interaction.commandName==='تشفير') return interaction.reply(encryptText(text));
  if(interaction.commandName==='فك_تشفير') return interaction.reply(decryptText(text));
});

/* ================= EXPRESS ================= */
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
  secret: 'render-secret',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname,'web')));

/* ================= STORE TYPES ================= */
const storeTypes = {
  PLATINUM:{every:600, here:600, stores:600},
  GOLD:{every:200, here:300, stores:400},
  VIP:{every:100, here:150, stores:200}
};

/* ================= LOG FUNCTION ================= */
function addLog(action, storeName, user, details=''){
  const time = new Date().toLocaleString();
  db.run(`INSERT INTO logs (time, action, store, discordName, discordId, details) VALUES (?,?,?,?,?,?)`,
    [time, action, storeName, user.username, user.id, details]
  );
}

/* ================= AUTH MIDDLEWARE ================= */
function auth(req,res,next){ if(!req.session.user) return res.redirect('/login.html'); next(); }

/* ================= OAUTH2 ================= */
app.get('/auth/login', (req,res)=>{
  const url=`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get('/auth/callback', async (req,res)=>{
  const code = req.query.code;
  if(!code) return res.send('❌ No code');
  try{
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body: params
    });
    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me',{
      headers:{Authorization:`Bearer ${tokenData.access_token}`}
    });
    const userData = await userRes.json();

    req.session.user={username:`${userData.username}#${userData.discriminator}`, id:userData.id};
    res.redirect('/dashboard.html');
  }catch(err){ console.error(err); res.send('❌ OAuth2 Error'); }
});

/* ================= API ================= */
app.post('/api/store', auth, (req,res)=>{
  const {action, data} = req.body;
  const user = req.session.user;

  if(action==='create'){
    const store = {
      id:Date.now().toString(), name:data.name, type:data.type,
      mentionEveryone:storeTypes[data.type].every,
      mentionHere:storeTypes[data.type].here,
      mentionStores:storeTypes[data.type].stores
    };
    db.run(`INSERT INTO stores (id,name,type,mentionEveryone,mentionHere,mentionStores) VALUES (?,?,?,?,?,?)`,
      [store.id, store.name, store.type, store.mentionEveryone, store.mentionHere, store.mentionStores]);
    addLog('إنشاء متجر', store.name, user, `الفئة: ${store.type}`);
    return res.json({ok:true});
  }

  if(action==='useMention'){
    db.get(`SELECT * FROM stores WHERE id=?`, [data.id], (err,row)=>{
      if(!row) return res.json({ok:false,msg:'❌ المتجر غير موجود'});
      if(row[data.field]<=0) return res.json({ok:false,msg:'انتهت المنشنات – تجديد بـ 30k'});
      const newCount = row[data.field]-data.amount;
      db.run(`UPDATE stores SET ${data.field}=? WHERE id=?`, [newCount,data.id]);
      addLog('استخدام منشن', row.name, user, `${data.field} - الكمية: ${data.amount}`);
      res.json({ok:true});
    });
  }
});

/* ================= GET LOGS ================= */
app.get('/api/logs', auth, (req,res)=>{
  db.all(`SELECT * FROM logs ORDER BY time DESC`, [], (err,rows)=>res.json(rows));
});

/* ================= START SERVER ================= */
app.listen(PORT, ()=>console.log(`🌐 Web server running on port ${PORT}`));
client.once('ready', ()=>console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(TOKEN);
