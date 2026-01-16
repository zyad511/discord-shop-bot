const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');

/* ================= CONFIG ================= */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1461493531775471864";
const PORT = process.env.PORT || 3000;

// معلومات OAuth2 لـ Discord
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/callback`;

/* ================= البوت ================= */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================ تشفير الشوبات ================ */
const shopEncryptMap = {
  "سعر":"س3ر","تبادل":"تbادل","متوفر":"مت9فر","مطلوب":"مطل9ب","عرض":"3رض",
  "رصيد":"ر9يد","طلب":"طلb"
};
const encryptText = t => t.split(' ').map(w=>shopEncryptMap[w]||w).join(' ');
const decryptText = t => {
  const r={}; for(const k in shopEncryptMap) r[shopEncryptMap[k]]=k;
  return t.split(' ').map(w=>r[w]||w).join(' ');
};

/* ================= Slash Commands ================= */
const commands = [
  new SlashCommandBuilder()
    .setName('تشفير')
    .setDescription('تشفير نص (خاص فقط)')
    .addStringOption(o=>o.setName('النص').setRequired(true)),
  new SlashCommandBuilder()
    .setName('فك_تشفير')
    .setDescription('فك تشفير نص (خاص فقط)')
    .addStringOption(o=>o.setName('النص').setRequired(true)),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض مساعدة')
].map(c=>c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Commands Ready');
})();

/* ================= Discord Interaction ================= */
client.on('interactionCreate', async interaction=>{
  if(!interaction.isChatInputCommand()) return;

  if((interaction.commandName==='تشفير'||interaction.commandName==='فك_تشفير')&&interaction.guild)
    return interaction.reply({content:'❌ هذا الأمر يعمل في الخاص فقط', ephemeral:true});

  if(interaction.commandName==='تشفير'){
    const text=interaction.options.getString('النص');
    return interaction.reply(encryptText(text));
  }

  if(interaction.commandName==='فك_تشفير'){
    const text=interaction.options.getString('النص');
    return interaction.reply(decryptText(text));
  }

  if(interaction.commandName==='help'){
    return interaction.reply('🧠 استخدم /تشفير أو /فك_تشفير. إدارة المتاجر من الموقع فقط.');
  }
});

/* ================= Express + Session ================= */
const app = express();
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(session({
  secret:'render-secret',
  resave:false,
  saveUninitialized:true
}));
app.use(express.static('web'));

/* ================ Data ================ */
let stores = [];
let logs = [];
const storeTypes = {
  PLATINUM:{every:600, hire:600, mentionStores:600, price:600000},
  GOLD:{every:200, hire:300, mentionStores:400, price:150000},
  VIP:{every:100, hire:150, mentionStores:200, price:80000}
};

/* ================= Logs ================= */
function addLog(action, storeName, discordName, discordId, details=''){
  logs.push({time:new Date().toLocaleString(), action, storeName, discordName, discordId, details});
}

/* ================= Discord OAuth2 ================= */
app.get('/auth/login', (req,res)=>{
  const url = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});

app.get('/auth/callback', async (req,res)=>{
  const code = req.query.code;
  if(!code) return res.send('❌ No code provided');
  // مثال مؤقت: استبدله بكود fetch للحصول على Access Token من Discord ثم جلب بيانات الحساب
  const discordUser = { username: "AdminUser", id: "987654321" };
  req.session.user = discordUser;
  res.redirect('/dashboard.html');
});

/* ================= Auth Middleware ================= */
function auth(req,res,next){
  if(req.session.user) return next();
  res.redirect('/login.html');
}

/* ================= API لإدارة المتاجر ================= */
app.post('/api/store-action', auth, (req,res)=>{
  const { action, data } = req.body;
  const user = req.session.user;

  switch(action){
    case 'addStore':
      stores.push(data);
      addLog('إنشاء متجر', data.name, user.username, user.id, `الفئة: ${data.type}`);
      break;
    case 'deleteStore':
      stores = stores.filter(s=>s.id!==data.id);
      addLog('حذف متجر', data.name, user.username, user.id);
      break;
    case 'updateStore':
      const idx = stores.findIndex(s=>s.id===data.id);
      if(idx!==-1) {
        addLog('تعديل متجر', stores[idx].name, user.username, user.id, `التفاصيل الجديدة: ${JSON.stringify(data)}`);
        stores[idx] = data;
      }
      break;
    case 'useMention':
      const store = stores.find(s=>s.id===data.id);
      if(!store) return res.json({ok:false,msg:'❌ المتجر غير موجود'});
      let remaining;
      if(data.type==='everyone') remaining=store.mentionEveryone;
      else if(data.type==='here') remaining=store.mentionHere;
      else if(data.type==='stores') remaining=store.mentionStores;
      if(remaining<data.amount){
        return res.json({ok:false,msg:'⚠️ انتهت المنشنات، تجديد جميع المنشنات ب 30k'});
      }
      if(data.type==='everyone') store.mentionEveryone-=data.amount;
      else if(data.type==='here') store.mentionHere-=data.amount;
      else if(data.type==='stores') store.mentionStores-=data.amount;
      addLog('استخدام منشن', store.name, user.username, user.id, `النوع: ${data.type} - الكمية: ${data.amount}`);
      break;
    case 'renewMentions':
      const s = stores.find(st=>st.id===data.id);
      if(s){
        s.mentionEveryone += storeTypes[s.type].every;
        s.mentionHere += storeTypes[s.type].hire;
        s.mentionStores += storeTypes[s.type].mentionStores;
        addLog('تجديد منشنات', s.name, user.username, user.id);
      }
      break;
    default: return res.status(400).json({error:'Unknown action'});
  }

  res.json({ok:true});
});

/* ================= API لجلب اللوج ================= */
app.get('/api/logs', auth, (req,res)=>{
  res.json(logs);
});

/* ================= تشغيل الموقع والبوت ================= */
app.listen(PORT, ()=>console.log(`🌐 Web server running on port ${PORT}`));
client.once('ready', ()=>console.log(`🤖 Logged in as ${client.user.tag}`));
client.login(TOKEN);
