const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fetch = require('node-fetch');
const SQLite = require('better-sqlite3');

// ==== CONFIG ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// ==== INIT BOT ====
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(TOKEN);

// ==== INIT DB ====
const db = new SQLite(path.join(__dirname, 'data', 'db.sqlite'));
db.prepare(`CREATE TABLE IF NOT EXISTS stores(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  type TEXT,
  mentionEveryone INTEGER,
  mentionHere INTEGER,
  mentionStores INTEGER
)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time TEXT,
  action TEXT,
  store TEXT,
  discordName TEXT,
  discordId TEXT,
  details TEXT
)`).run();

// ==== تشفير الشوبات ====
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

function encryptText(text){ return text.split(' ').map(w=>shopEncryptMap[w]||w).join(' '); }
function decryptText(text){ 
  const reverse={}; for(const k in shopEncryptMap) reverse[shopEncryptMap[k]]=k;
  return text.split(' ').map(w=>reverse[w]||w).join(' '); 
}

// ==== STORE TYPES ====
const storeTypes = {
  PLATINUM: { every: 600, hire: 600, mentionStores: 600, price: 600000 },
  GOLD: { every: 200, hire: 300, mentionStores: 400, price: 150000 },
  VIP: { every: 100, hire: 150, mentionStores: 200, price: 80000 }
};

// ==== DISCORD COMMANDS ====
const commands = [
  new SlashCommandBuilder().setName('تشفير').setDescription('تشفير نص حسب كلمات الشوبات').addStringOption(o=>o.setName('النص').setDescription('اكتب النص المراد تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('فك_تشفير').setDescription('فك نص مشفر للشوبات').addStringOption(o=>o.setName('النص').setDescription('اكتب النص المراد فك تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('عرض جميع أوامر البوت')
].map(c=>c.toJSON());

const rest = new REST({ version:'10' }).setToken(TOKEN);
(async()=>{ await rest.put(Routes.applicationCommands(CLIENT_ID), { body:commands }); console.log('✅ تم تسجيل الأوامر'); })();

// ==== EXPRESS ====
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(session({ secret:'supersecret', resave:false, saveUninitialized:true }));

// ==== MIDDLEWARES ====
function requireBasicLogin(req,res,next){ if(!req.session.basicAuth) return res.redirect('/login.html'); next(); }
function requireDiscord(req,res,next){ if(!req.session.user) return res.redirect('/auth/login'); next(); }

// ==== LOGIN PAGE ====
app.get('/login.html', (req,res)=>res.sendFile(path.join(__dirname,'web','login.html')));
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
  const tokenRes=await fetch('https://discord.com/api/oauth2/token',{method:'POST',body:params,headers:{ 'Content-Type':'application/x-www-form-urlencoded' }}).then(r=>r.json());
  if(tokenRes.error) return res.send('❌ '+tokenRes.error);
  const userData=await fetch('https://discord.com/api/users/@me',{ headers:{ 'Authorization':`Bearer ${tokenRes.access_token}` } }).then(r=>r.json());
  req.session.user=userData;
  res.redirect('/dashboard.html');
});

// ==== DASHBOARD ====
app.get('/dashboard.html', requireBasicLogin, requireDiscord,(req,res)=>res.sendFile(path.join(__dirname,'web','dashboard.html')));

// ==== API STORE + BOT ====
app.get('/api/stores', requireBasicLogin, requireDiscord,(req,res)=>{ const rows=db.prepare('SELECT * FROM stores').all(); res.json(rows); });
app.get('/api/logs', requireBasicLogin, requireDiscord,(req,res)=>{ const rows=db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 50').all(); res.json(rows); });

app.post('/api/store', requireBasicLogin, requireDiscord,(req,res)=>{
  const { action,data }=req.body;
  try{
    if(action==='create'){
      const stmt=db.prepare('INSERT INTO stores(name,type,mentionEveryone,mentionHere,mentionStores) VALUES(?,?,?,?,?)');
      stmt.run(data.name,data.type,100,50,50);
      db.prepare('INSERT INTO logs(time,action,store,discordName,discordId,details) VALUES(?,?,?,?,?,?)')
        .run(new Date().toLocaleString(),'إنشاء متجر',data.name,req.session.user.username,req.session.user.id,`نوع: ${data.type}`);
      return res.json({ok:true});
    }
    else if(action==='useMention'){
      const store=db.prepare('SELECT * FROM stores WHERE id=?').get(data.id);
      if(!store) return res.json({ok:false,msg:'❌ المتجر غير موجود'});
      if(store[data.field]<=0) return res.json({ok:false,msg:'❌ لا يوجد منشنات متبقية'});
      db.prepare(`UPDATE stores SET ${data.field}=? WHERE id=?`).run(store[data.field]-data.amount,data.id);
      db.prepare('INSERT INTO logs(time,action,store,discordName,discordId,details) VALUES(?,?,?,?,?,?)')
        .run(new Date().toLocaleString(),'استخدام منشن',store.name,req.session.user.username,req.session.user.id,`نوع: ${data.field}, كمية: ${data.amount}`);
      return res.json({ok:true});
    }
  }catch(e){ res.json({ok:false,msg:e.message}); }
});

app.post('/api/bot', requireBasicLogin, requireDiscord, async(req,res)=>{
  const { command, params }=req.body;
  try{
    if(command==='sendMessage'){
      const channel=client.channels.cache.get(params.channelId);
      if(channel) await channel.send(params.message);
    }
    res.json({ok:true});
  }catch(e){ res.json({ok:false,msg:e.message}); }
});

// ==== STATIC ====
app.use(express.static(path.join(__dirname,'web')));
app.get('/',(req,res)=>res.send('✅ Discord Shop Bot running'));

// ==== START SERVER ====
app.listen(PORT,()=>console.log(`🌐 Web server running on port ${PORT}`));
client.once('ready',()=>console.log(`🤖 Logged in as ${client.user.tag}`));
