const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

// ==== CONFIG ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// ==== BOT ====
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(TOKEN);

// ==== DB ====
const dbFile = path.join(__dirname,'data','db.sqlite');
let db;

(async()=>{
  db = await sqlite.open({ filename: dbFile, driver: sqlite3.Database });
  await db.run(`CREATE TABLE IF NOT EXISTS stores(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    type TEXT,
    mentionEveryone INTEGER,
    mentionHere INTEGER,
    mentionStores INTEGER
  )`);
  await db.run(`CREATE TABLE IF NOT EXISTS logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time TEXT,
    action TEXT,
    store TEXT,
    discordName TEXT,
    discordId TEXT,
    details TEXT
  )`);
})();

// ==== تشفير الشوبات ====
const shopEncryptMap = {
  "سعر": "س3ر","تبادل": "تbادل","متوفر": "مت9فر","مطلوب": "مطل9ب",
  "عرض": "3رض","عروضكم": "3ر9ضكم","عرضك": "3رضك","رصيد": "ر9يد",
  "طلب": "طلb","رصيدك": "ر9يدك","رصيدكم": "ر9يدكم","طلبات": "طلbات","خاص": "خا9"
};
function encryptText(text){ return text.split(' ').map(w=>shopEncryptMap[w]||w).join(' '); }
function decryptText(text){ const r={}; for(const k in shopEncryptMap) r[shopEncryptMap[k]]=k; return text.split(' ').map(w=>r[w]||w).join(' '); }

// ==== STORE TYPES ====
const storeTypes = {
  PLATINUM: { every:600, hire:600, mentionStores:600, price:600000 },
  GOLD: { every:200, hire:300, mentionStores:400, price:150000 },
  VIP: { every:100, hire:150, mentionStores:200, price:80000 }
};

// ==== DISCORD COMMANDS ====
const commands = [
  new SlashCommandBuilder().setName('تشفير').setDescription('تشفير نص حسب كلمات الشوبات').addStringOption(o=>o.setName('النص').setDescription('النص المراد تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('فك_تشفير').setDescription('فك نص مشفر للشوبات').addStringOption(o=>o.setName('النص').setDescription('النص المراد فك تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('عرض جميع أوامر البوت')
].map(c=>c.toJSON());

const rest = new REST({ version:'10' }).setToken(TOKEN);
(async()=>{ await rest.put(Routes.applicationCommands(CLIENT_ID), { body:commands }); console.log('✅ تم تسجيل الأوامر'); })();

// ==== EXPRESS ====
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(session({ secret:'supersecret', resave:false, saveUninitialized:true }));

function requireBasicLogin(req,res,next){ if(!req.session.basicAuth) return res.redirect('/login.html'); next(); }
function requireDiscord(req,res,next){ if(!req.session.user) return res.redirect('/auth/login'); next(); }

// ==== LOGIN PAGE ====
app.get('/login.html',(req,res)=>res.sendFile(path.join(__dirname,'web','login.html')));
app.post('/login',(req,res)=>{
  const { username,password } = req.body;
  if(username===ADMIN_USER && password===ADMIN_PASS){ req.session.basicAuth=true; return res.redirect('/auth/login'); }
  res.send('❌ بيانات الدخول غير صحيحة');
});

// ==== DISCORD OAUTH2 ====
app.get('/auth/login', requireBasicLogin,(req,res)=>{
  const url=`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get('/auth/callback', async(req,res)=>{
  const code=req.query.code;
  if(!code) return res.send('❌ لا يوجد كود OAuth2');
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method:'POST', body:params, headers:{ 'Content-Type':'application/x-www-form-urlencoded' }}).then(r=>r.json());
  if(tokenRes.error) return res.send('❌ '+tokenRes.error);
  const userData = await fetch('https://discord.com/api/users/@me',{ headers:{ 'Authorization':`Bearer ${tokenRes.access_token}` } }).then(r=>r.json());
  req.session.user=userData;
  res.redirect('/dashboard.html');
});

// ==== DASHBOARD ====
app.get('/dashboard.html', requireBasicLogin, requireDiscord,(req,res)=>res.sendFile(path.join(__dirname,'web','dashboard.html')));

// ==== API ====
app.get('/api/stores', requireBasicLogin, requireDiscord, async(req,res)=>{ const rows = await db.all('SELECT * FROM stores'); res.json(rows); });
app.get('/api/logs', requireBasicLogin, requireDiscord, async(req,res)=>{ const rows = await db.all('SELECT * FROM logs ORDER BY id DESC LIMIT 50'); res.json(rows); });

app.post('/api/store', requireBasicLogin, requireDiscord, async(req,res)=>{
  const { action,data }=req.body;
  try{
    if(action==='create'){
      await db.run('INSERT INTO stores(name,type,mentionEveryone,mentionHere,mentionStores) VALUES(?,?,?,?,?)',[data.name,data.type,100,50,50]);
      await db.run('INSERT INTO logs(time,action,store,discordName,discordId,details) VALUES(?,?,?,?,?,?)',
        [new Date().toLocaleString(),'إنشاء متجر',data.name,req.session.user.username,req.session.user.id,`نوع: ${data.type}`]);
      return res.json({ok:true});
    }
    else if(action==='useMention'){
      const store = await db.get('SELECT * FROM stores WHERE id=?',[data.id]);
      if(!store) return res.json({ok:false,msg:'❌ المتجر غير موجود'});
      if(store[data.field]<=0) return res.json({ok:false,msg:'❌ لا يوجد منشنات متبقية'});
      await db.run(`UPDATE stores SET ${data.field}=? WHERE id=?`,[store[data.field]-data.amount,data.id]);
      await db.run('INSERT INTO logs(time,action,store,discordName,discordId,details) VALUES(?,?,?,?,?,?)',
        [new Date().toLocaleString(),'استخدام منشن',store.name,req.session.user.username,req.session.user.id,`نوع: ${data.field}, كمية: ${data.amount}`]);
      return res.json({ok:true});
    }
  }catch(e){ res.json({ok:false,msg:e.message}); }
});

// ==== STATIC ====
app.use(express.static(path.join(__dirname,'web')));
app.get('/',(req,res)=>res.send('✅ Discord Shop Bot running'));

// ==== START SERVER ====
app.listen(PORT,()=>console.log(`🌐 Web server running on port ${PORT}`));
client.once('ready',()=>console.log(`🤖 Logged in as ${client.user.tag}`));
