const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');

/* ================== CONFIG ================== */
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const PORT = process.env.PORT || 3000;

if (!TOKEN || !CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

/* ================== DISCORD BOT ================== */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================== ENCRYPTION ================== */
const shopEncryptMap = {
  "سعر": "س3ر",
  "تبادل": "تbادل",
  "متوفر": "مت9فر",
  "مطلوب": "مطل9ب",
  "عرض": "3رض",
  "رصيد": "ر9يد",
  "طلب": "طلb"
};

function encryptText(text) {
  return text.split(' ').map(w => shopEncryptMap[w] || w).join(' ');
}

function decryptText(text) {
  const reverse = {};
  for (const k in shopEncryptMap) reverse[shopEncryptMap[k]] = k;
  return text.split(' ').map(w => reverse[w] || w).join(' ');
}

/* ================== SLASH COMMANDS ================== */
const commands = [
  new SlashCommandBuilder()
    .setName('تشفير')
    .setDescription('تشفير نص (خاص فقط)')
    .addStringOption(o =>
      o.setName('النص').setDescription('النص').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('فك_تشفير')
    .setDescription('فك تشفير نص (خاص فقط)')
    .addStringOption(o =>
      o.setName('النص').setDescription('النص').setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('✅ Slash commands registered');
})();

/* ================== BOT INTERACTIONS ================== */
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.guild) {
    return interaction.reply({
      content: '❌ هذه الأوامر تعمل في الخاص فقط',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'تشفير') {
    const text = interaction.options.getString('النص');
    return interaction.reply(encryptText(text));
  }

  if (interaction.commandName === 'فك_تشفير') {
    const text = interaction.options.getString('النص');
    return interaction.reply(decryptText(text));
  }
});

/* ================== EXPRESS APP ================== */
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'render-secret',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static('web'));

/* ================== DATA ================== */
let stores = [];
let logs = [];

const storeTypes = {
  PLATINUM: { every: 600, here: 600, stores: 600 },
  GOLD: { every: 200, here: 300, stores: 400 },
  VIP: { every: 100, here: 150, stores: 200 }
};

/* ================== LOG FUNCTION ================== */
function addLog(action, storeName, user, details = '') {
  logs.push({
    time: new Date().toLocaleString(),
    action,
    store: storeName,
    discordName: user.username,
    discordId: user.id,
    details
  });
}

/* ================== AUTH ================== */
function auth(req, res, next) {
  if (!req.session.user) return res.redirect('/login.html');
  next();
}

/* ================== DISCORD OAUTH2 ================== */
app.get('/auth/login', (req, res) => {
  const url =
    `https://discord.com/api/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('❌ No code');

  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', REDIRECT_URI);

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const tokenData = await tokenRes.json();

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const userData = await userRes.json();

    req.session.user = {
      username: `${userData.username}#${userData.discriminator}`,
      id: userData.id
    };

    res.redirect('/dashboard.html');
  } catch (err) {
    console.error(err);
    res.send('❌ OAuth2 Error');
  }
});

/* ================== API ================== */
app.post('/api/store', auth, (req, res) => {
  const { action, data } = req.body;
  const user = req.session.user;

  if (action === 'create') {
    data.mentionEveryone = storeTypes[data.type].every;
    data.mentionHere = storeTypes[data.type].here;
    data.mentionStores = storeTypes[data.type].stores;
    stores.push(data);
    addLog('إنشاء متجر', data.name, user, `الفئة: ${data.type}`);
  }

  if (action === 'useMention') {
    const store = stores.find(s => s.id === data.id);
    if (!store) return res.json({ ok: false });

    if (store[data.field] <= 0) {
      addLog('نفاد منشن', store.name, user, data.field);
      return res.json({ ok: false, msg: 'انتهت المنشنات – تجديد بـ 30k' });
    }

    store[data.field]--;
    addLog('استخدام منشن', store.name, user, data.field);
  }

  res.json({ ok: true });
});

app.get('/api/logs', auth, (req, res) => {
  res.json(logs);
});

/* ================== START ================== */
app.listen(PORT, () =>
  console.log(`🌐 Web running on ${PORT}`)
);

client.once('ready', () =>
  console.log(`🤖 Logged in as ${client.user.tag}`)
);

client.login(TOKEN);
