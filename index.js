// ==== IMPORTS ====
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

// ==== ENV VARIABLES ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;

// ==== ENSURE DATA FOLDER ====
const dataPath = path.join(__dirname, 'data');
if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });

// ==== SQLITE DATABASE ====
const db = new sqlite3.Database(path.join(dataPath, 'database.sqlite'));
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

// ==== EXPRESS APP ====
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'web')));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataPath }),
  secret: 'super-secret',
  resave: false,
  saveUninitialized: false
}));

// ==== MIDDLEWARES ====
function requireBasicLogin(req,res,next){
  if(!req.session.basicAuth) return res.redirect('/login.html');
  next();
}
function requireDiscord(req,res,next){
  if(!req.session.user) return res.redirect('/auth/login');
  next();
}

// ==== LOGIN PAGE ====
app.get('/login.html',(req,res)=>{
  res.sendFile(path.join(__dirname,'web','login.html'));
});
app.post('/login',(req,res)=>{
  const { username,password } = req.body;
  if(username===ADMIN_USER && password===ADMIN_PASS){
    req.session.basicAuth=true;
    return res.redirect('/auth/login');
  }
  res.send('❌ بيانات الدخول غير صحيحة');
});

// ==== DISCORD OAUTH2 ====
app.get('/auth/login', requireBasicLogin, (req,res)=>{
  const url=`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});
app.get('/auth/callback', async (req,res)=>{
  const code=req.query.code;
  if(!code) return res.send('❌ لا يوجد كود OAuth2');

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'authorization_code');
  params.append('code', code);
  params.append('redirect_uri', REDIRECT_URI);

  const tokenRes=await fetch('https://discord.com/api/oauth2/token',{
    method:'POST',body:params,headers:{'Content-Type':'application/x-www-form-urlencoded'}
  }).then(r=>r.json());

  const userData=await fetch('https://discord.com/api/users/@me',{
    headers:{'Authorization':`Bearer ${tokenRes.access_token}`}
  }).then(r=>r.json());

  req.session.user=userData;
  res.redirect('/dashboard.html');
});

// ==== DASHBOARD PAGE ====
app.get('/dashboard.html', requireBasicLogin, requireDiscord, (req,res)=>{
  res.sendFile(path.join(__dirname,'web','dashboard.html'));
});

// ==== API ====
app.get('/api/stores', requireBasicLogin, requireDiscord, (req,res)=>{
  db.all(`SELECT * FROM stores`, (err,rows)=>res.json(rows||[]));
});
app.get('/api/logs', requireBasicLogin, requireDiscord, (req,res)=>{
  db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`, (err,rows)=>res.json(rows||[]));
});
app.post('/api/store', requireBasicLogin, requireDiscord, (req,res)=>{
  const { action,data } = req.body;
  const user = req.session.user;
  if(action==='create'){
    db.run(`INSERT INTO stores(owner,name,type,mentionEveryone,mentionHere,mentionStores)
      VALUES(?,?,?,?,?,?)`, [user.id,data.name,data.type,0,0,0], function(err){
        if(err) return res.json({ok:false,msg:err.message});
        db.run(`INSERT INTO logs(time,action,store,discordName,discordId,details)
          VALUES(?,?,?,?,?,?)`,
          [new Date().toLocaleString(),'إنشاء متجر',data.name,user.username,user.id,`الفئة: ${data.type}`]);
        res.json({ok:true});
    });
  } else if(action==='useMention'){
    const { id, field, amount } = data;
    db.get(`SELECT * FROM stores WHERE id=?`,[id],(err,store)=>{
      if(!store) return res.json({ok:false,msg:'❌ المتجر غير موجود'});
      if(store[field]+amount>30000) return res.json({ok:false,msg:'❌ الحد الأقصى للمنشنات 30k'});
      db.run(`UPDATE stores SET ${field}=? WHERE id=?`,[store[field]+amount,id]);
      db.run(`INSERT INTO logs(time,action,store,discordName,discordId,details)
        VALUES(?,?,?,?,?,?)`,
        [new Date().toLocaleString(),'استخدام منشن',store.name,user.username,user.id,`نوع: ${field} +${amount}`]);
      res.json({ok:true});
    });
  } else res.json({ok:false,msg:'❌ أمر غير معروف'});
});

// ==== START EXPRESS ====
app.get('/',(req,res)=>res.redirect('/login.html'));
app.listen(PORT,()=>console.log(`🌐 Web server running on port ${PORT}`));

// ==== SHOP ENCRYPTION ====
const shopEncryptMap = {"سعر":"س3ر","تبادل":"تbادل","متوفر":"مت9فر","مطلوب":"مطل9ب","عرض":"3رض","عروضكم":"3ر9ضكم","عرضك":"3رضك","رصيد":"ر9يد","طلب":"طلb","رصيدك":"ر9يدك","رصيدكم":"ر9يدكم","طلبات":"طلbات","خاص":"خا9"};
function encryptText(text){return text.split(' ').map(w=>shopEncryptMap[w]||w).join(' ');}
function decryptText(text){const r={};for(const k in shopEncryptMap) r[shopEncryptMap[k]]=k; return text.split(' ').map(w=>r[w]||w).join(' ');}

// ==== DISCORD BOT ====
const client=new Client({intents:[GatewayIntentBits.Guilds]});
const commands=[
  new SlashCommandBuilder().setName('تشفير').setDescription('تشفير نص حسب كلمات الشوبات').addStringOption(o=>o.setName('النص').setDescription('اكتب النص المراد تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('فك_تشفير').setDescription('فك نص مشفر للشوبات').addStringOption(o=>o.setName('النص').setDescription('اكتب النص المراد فك تشفيره').setRequired(true)),
  new SlashCommandBuilder().setName('help').setDescription('عرض جميع أوامر البوت')
].map(c=>c.toJSON());
const rest=new REST({version:'10'}).setToken(TOKEN);
(async()=>{await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands});console.log('✅ تم تسجيل أوامر البوت');})();

client.on('interactionCreate',async interaction=>{
  if(!interaction.isChatInputCommand()) return;
  if(interaction.guild) return interaction.reply({content:'❌ هذه الأوامر تعمل في الخاص فقط',ephemeral:true});
  const cmd=interaction.commandName;
  if(cmd==='تشفير'){const t=interaction.options.getString('النص');await interaction.reply({content:encryptText(t)});}
  else if(cmd==='فك_تشفير'){const t=interaction.options.getString('النص');await interaction.reply({content:decryptText(t)});}
  else if(cmd==='help'){const e=new EmbedBuilder().setTitle('📜 قائمة أوامر البوت').setColor('Blue').setDescription('/تشفير <النص> → تشفير نص\n/فك_تشفير <النص> → فك نص مشفر');await interaction.reply({embeds:[e]});}
  else await interaction.reply({content:'⚠️ هذا الأمر غير معرف',ephemeral:true});
});

client.once('ready',()=>console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(TOKEN);
