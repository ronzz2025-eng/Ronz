const { Telegraf } = require('telegraf');
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    jidNormalizedUser, 
    DisconnectReason 
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require('fs');
const path = require('path');

// Config
const TELEGRAM_BOT_TOKEN = '8242392104:AAGIVrLW7jzUxrhtvQs_GXyhz--Her52wSE';
const OWNER_ID = '8379869700';
let MAX_NUMBERS = 500;
let COOLDOWN_TIME = 30; // detik

// Channel yang wajib dijoin
const REQUIRED_CHANNEL = '@chanelronz';
const CHANNEL_LINK = 'https://t.me/chanelronz';

// Inisialisasi
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
let whatsappSock = null;
let isWhatsAppConnected = false;
let pairingCode = null;
let pairingNumber = null;
const userCooldown = new Map();
const allowedUsers = new Set([OWNER_ID]);
const groupMode = new Set();
let groupOnlyMode = false;

// Load config dari file
function loadConfig() {
    try {
        if (fs.existsSync('config.json')) {
            const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
            MAX_NUMBERS = config.maxNumbers || MAX_NUMBERS;
            COOLDOWN_TIME = config.cooldownTime || COOLDOWN_TIME;
            console.log('🎯 Config loaded from file');
        }
    } catch (error) {
        console.log('⚠️ Error loading config, using defaults');
    }
}

// Save config ke file
function saveConfig() {
    try {
        const config = {
            maxNumbers: MAX_NUMBERS,
            cooldownTime: COOLDOWN_TIME,
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
        console.log('💾 Config saved to file');
    } catch (error) {
        console.log('❌ Error saving config:', error);
    }
}

// Load log history
function loadLogHistory() {
    try {
        if (fs.existsSync('cekbio_logs.json')) {
            return JSON.parse(fs.readFileSync('cekbio_logs.json', 'utf8'));
        }
    } catch (error) {
        console.log('⚠️ Error loading log history');
    }
    return [];
}

// Save log history
function saveLogHistory(logs) {
    try {
        const limitedLogs = logs.slice(-100);
        fs.writeFileSync('cekbio_logs.json', JSON.stringify(limitedLogs, null, 2));
    } catch (error) {
        console.log('❌ Error saving log history:', error);
    }
}

// Add log entry
function addLogEntry(userId, username, numbersCount, results, source = 'manual') {
    const logs = loadLogHistory();
    const logEntry = {
        id: Date.now().toString(),
        userId: userId.toString(),
        username: username || 'Unknown',
        timestamp: new Date().toISOString(),
        numbersCount: numbersCount,
        registered: results.filter(r => r.registered).length,
        withBio: results.filter(r => r.registered && r.bio && r.bio.length > 0).length,
        business: results.filter(r => r.isBusiness).length,
        verified: results.filter(r => r.metaVerified).length,
        source: source
    };
    logs.push(logEntry);
    saveLogHistory(logs);
    return logEntry;
}

// ==================== STYLISH DESIGN SYSTEM ====================

// Emoji dan styling constants
const EMOJI = {
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '🔄',
    SEARCH: '🔍',
    SETTINGS: '⚙️',
    USER: '👤',
    GROUP: '👥',
    CROWN: '👑',
    LOCK: '🔒',
    UNLOCK: '🔓',
    CLOCK: '⏰',
    PHONE: '📱',
    CHART: '📊',
    FILE: '📁',
    CAMERA: '📸',
    BUSINESS: '🏢',
    VERIFIED: '⭐',
    FIRE: '🔥',
    ROCKET: '🚀',
    GEM: '💎',
    SPARKLES: '✨',
    BULLET: '•',
    ARROW: '➜',
    CHECK: '✓',
    CROSS: '✗',
    STAR: '★',
    HEART: '❤️',
    FLASH: '⚡',
    SHIELD: '🛡️',
    TROPHY: '🏆',
    MEDAL: '🎖️',
    CROWN_2: '♔',
    DIAMOND: '💠'
};

// Color codes for terminal
const COLORS = {
    RESET: '\x1b[0m',
    BRIGHT: '\x1b[1m',
    DIM: '\x1b[2m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m'
};

// Stylish console logging
function logInfo(message) {
    console.log(`${COLORS.CYAN}${EMOJI.INFO} ${message}${COLORS.RESET}`);
}

function logSuccess(message) {
    console.log(`${COLORS.GREEN}${EMOJI.SUCCESS} ${message}${COLORS.RESET}`);
}

function logError(message) {
    console.log(`${COLORS.RED}${EMOJI.ERROR} ${message}${COLORS.RESET}`);
}

function logWarning(message) {
    console.log(`${COLORS.YELLOW}${EMOJI.WARNING} ${message}${COLORS.RESET}`);
}

function logSystem(message) {
    console.log(`${COLORS.MAGENTA}${EMOJI.SETTINGS} ${message}${COLORS.RESET}`);
}

// Modern text formatting functions
function createHeader(title, emoji = EMOJI.SPARKLES) {
    const header = `╔${'═'.repeat(38)}╗\n`;
    const titleLine = `║${emoji} ${title.padEnd(35)}║\n`;
    const footer = `╚${'═'.repeat(38)}╝`;
    return header + titleLine + footer;
}

function createSection(title, items, emoji = EMOJI.BULLET) {
    let section = `\n${EMOJI.FLASH} ${title}\n`;
    items.forEach((item, index) => {
        const isLast = index === items.length - 1;
        const prefix = isLast ? '└─ ' : '├─ ';
        section += `${prefix}${emoji} ${item}\n`;
    });
    return section;
}

function createStatsBox(stats) {
    let box = `\n${EMOJI.CHART} ${EMOJI.SHIELD} STATISTICS ${EMOJI.SHIELD}\n`;
    box += '┌' + '─'.repeat(36) + '┐\n';
    
    stats.forEach((stat, index) => {
        const isLast = index === stats.length - 1;
        const prefix = isLast ? '└' : '│';
        box += `${prefix} ${stat.padEnd(35)}${prefix}\n`;
    });
    
    box += '└' + '─'.repeat(36) + '┘';
    return box;
}

function createFeatureCard(features, title = "PREMIUM FEATURES") {
    let card = `\n${EMOJI.GEM} ${title} ${EMOJI.GEM}\n`;
    card += '╔' + '═'.repeat(38) + '╗\n';
    
    features.forEach((feature, index) => {
        const isLast = index === features.length - 1;
        const border = isLast ? '╚' : '║';
        card += `║ ${EMOJI.STAR} ${feature.padEnd(35)}║\n`;
    });
    
    card += '╚' + '═'.repeat(38) + '╝';
    return card;
}

// ==================== ENHANCED CHANNEL CHECK ====================

async function checkChannelMembership(ctx) {
  try {
    if (ctx.from.id.toString() === OWNER_ID) {
      return true;
    }

    const chatMember = await ctx.telegram.getChatMember(REQUIRED_CHANNEL, ctx.from.id);
    const allowedStatuses = ['member', 'administrator', 'creator'];
    return allowedStatuses.includes(chatMember.status);
    
  } catch (error) {
    console.log('Channel check error:', error.message);
    if (error.response && error.response.error_code === 400) {
      return false;
    }
    return true;
  }
}

function showChannelRequirement(ctx) {
  const message = 
    `${EMOJI.LOCK} *PREMIUM ACCESS REQUIRED* ${EMOJI.LOCK}\n\n` +
    `${EMOJI.INFO} To unlock all features, join our official channel:\n\n` +
    `${EMOJI.STAR} **Mandatory Channel:** ${REQUIRED_CHANNEL}\n\n` +
    `${EMOJI.FLASH} *Quick Steps:*\n` +
    `1. Click join button below\n` +
    `2. Join ${REQUIRED_CHANNEL}\n` +
    `3. Return and tap ${EMOJI.CHECK} I've Joined\n\n` +
    `${EMOJI.ROCKET} Get instant access after joining!`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `${EMOJI.ROCKET} JOIN PREMIUM CHANNEL`,
            url: CHANNEL_LINK
          }
        ],
        [
          {
            text: `${EMOJI.CHECK} VERIFY MEMBERSHIP`,
            callback_data: 'check_membership'
          }
        ]
      ]
    }
  };

  return safeReply(ctx, message, { 
    parse_mode: 'Markdown',
    ...keyboard
  });
}

// Enhanced membership check handler
bot.action('check_membership', async (ctx) => {
  try {
    await ctx.answerCbQuery(`${EMOJI.LOADING} Verifying membership...`);
    
    const isMember = await checkChannelMembership(ctx);
    
    if (isMember) {
      await ctx.editMessageText(
        `${EMOJI.TROPHY} *ACCESS GRANTED* ${EMOJI.TROPHY}\n\n` +
        `${EMOJI.SUCCESS} Welcome to premium features!\n\n` +
        `${EMOJI.ROCKET} You now have full access to:\n` +
        `${EMOJI.STAR} Bio Checking\n` +
        `${EMOJI.CAMERA} Profile Photos\n` +
        `${EMOJI.VERIFIED} Meta Verification\n` +
        `${EMOJI.BUSINESS} Business Detection\n\n` +
        `Type /start to begin!`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.editMessageText(
        `${EMOJI.LOCK} *MEMBERSHIP NOT DETECTED* ${EMOJI.LOCK}\n\n` +
        `${EMOJI.WARNING} We couldn't find you in ${REQUIRED_CHANNEL}\n\n` +
        `${EMOJI.INFO} *Please ensure:*\n` +
        `${EMOJI.CHECK} You've joined the channel\n` +
        `${EMOJI.CHECK} You haven't left\n` +
        `${EMOJI.CHECK} Wait a few seconds then retry\n\n` +
        `${EMOJI.FLASH} Click below to join:`,
        { 
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `${EMOJI.ROCKET} JOIN CHANNEL`,
                  url: CHANNEL_LINK
                }
              ],
              [
                {
                  text: `${EMOJI.LOADING} RE-VERIFY`,
                  callback_data: 'check_membership'
                }
              ]
            ]
          }
        }
      );
    }
  } catch (error) {
    console.log('Membership check error:', error);
    await ctx.answerCbQuery(`${EMOJI.ERROR} Verification failed, try again`);
  }
});

// Enhanced middleware with stylish messages
bot.use(async (ctx, next) => {
  if (ctx.message && ctx.message.text && ctx.message.text.startsWith('/start')) {
    return next();
  }
  
  if (ctx.updateType === 'callback_query') {
    return next();
  }

  const isMember = await checkChannelMembership(ctx);
  
  if (!isMember) {
    await showChannelRequirement(ctx);
    return;
  }
  
  return next();
});

// Enhanced safe reply with typing indicators
async function safeReply(ctx, text, options = {}) {
  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
    const result = await ctx.reply(text, options);
    return result;
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      logWarning(`Bot blocked by user: ${ctx.from?.id}`);
      return null;
    }
    logError(`Reply error: ${error.message}`);
    return null;
  }
}

// ==================== MODERN ACCESS CONTROL ====================

function isAllowed(userId) {
  return allowedUsers.has(userId.toString());
}

function isGroupAllowed(chatId) {
  return groupMode.has(chatId.toString());
}

function isGroupChat(chatType) {
  return ['group', 'supergroup'].includes(chatType);
}

function validateAccess(ctx) {
  try {
    const userId = ctx.from.id.toString();
    const chatId = ctx.chat.id.toString();
    const chatType = ctx.chat.type;
    
    if (userId === OWNER_ID) return true;
    
    if (groupOnlyMode) {
      if (!isGroupChat(chatType)) {
        safeReply(ctx, 
          `${EMOJI.GROUP} *GROUP EXCLUSIVE MODE* ${EMOJI.GROUP}\n\n` +
          `${EMOJI.INFO} This bot only works in authorized groups.\n` +
          `${EMOJI.FLASH} Ask owner to enable with /enablegroup`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
      if (!isGroupAllowed(chatId)) {
        safeReply(ctx,
          `${EMOJI.LOCK} *GROUP NOT AUTHORIZED* ${EMOJI.LOCK}\n\n` +
          `${EMOJI.INFO} This group needs owner approval.\n` +
          `${EMOJI.FLASH} Owner can enable with /enablegroup`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
      return true;
    }
    
    if (isGroupChat(chatType)) {
      if (!isGroupAllowed(chatId)) {
        safeReply(ctx,
          `${EMOJI.LOCK} *GROUP ACCESS DENIED* ${EMOJI.LOCK}\n\n` +
          `${EMOJI.INFO} Owner must enable this group first.\n` +
          `${EMOJI.FLASH} Use /enablegroup in this group`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
      return true;
    } else {
      if (!isAllowed(userId)) {
        safeReply(ctx,
          `${EMOJI.LOCK} *PREMIUM ACCESS REQUIRED* ${EMOJI.LOCK}\n\n` +
          `${EMOJI.INFO} Contact owner for access privileges.\n` +
          `${EMOJI.STAR} You need to be whitelisted to use this bot.`,
          { parse_mode: 'Markdown' }
        );
        return false;
      }
      return true;
    }
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      logWarning(`Bot blocked during access check: ${ctx.from?.id}`);
      return false;
    }
    throw error;
  }
}

// Enhanced cooldown system
function checkCooldown(userId) {
  const now = Date.now();
  const lastUsed = userCooldown.get(userId);
  
  if (!lastUsed) {
    userCooldown.set(userId, now);
    return { allowed: true, remaining: 0 };
  }
  
  const elapsed = (now - lastUsed) / 1000;
  const remaining = COOLDOWN_TIME - elapsed;
  
  if (remaining <= 0) {
    userCooldown.set(userId, now);
    return { allowed: true, remaining: 0 };
  }
  
  return { allowed: false, remaining: Math.ceil(remaining) };
}

// ==================== FUNGSI YANG DIBUTUHKAN ====================

// Fungsi untuk format tanggal
function formatTimestamp(timestamp) {
  if (!timestamp) return "Tidak diketahui";
  
  try {
    let dateObj;
    if (timestamp > 1000000000000) {
      dateObj = new Date(timestamp);
    } else {
      dateObj = new Date(timestamp * 1000);
    }
    
    if (isNaN(dateObj.getTime())) {
      return "Format tanggal tidak valid";
    }
    
    const options = {
      day: "2-digit",
      month: "long", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    };
    
    return dateObj.toLocaleDateString("id-ID", options);
  } catch (error) {
    return "Error format tanggal";
  }
}

// Fungsi untuk menghitung umur bio (dalam hari)
function calculateBioAge(setAt) {
  if (!setAt) return 9999;
  
  try {
    let timestamp = setAt;
    if (timestamp <= 1000000000000) {
      timestamp = timestamp * 1000;
    }
    
    const bioDate = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now - bioDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (error) {
    return 9999;
  }
}

// FUNGSI CEK META YANG LEBIH AKURAT
function checkMetaVerification(bizProfile) {
  if (!bizProfile) return { verified: false, type: '👤 Personal', category: 'personal', score: 0 };
  
  // Cek tanda-tanda utama Meta Verified
  const hasVerifiedBadge = !!bizProfile.verified;
  const hasWebsite = !!bizProfile.website;
  const hasEmail = !!bizProfile.email;
  const hasAddress = !!bizProfile.address;
  const hasCategory = !!bizProfile.category;
  const hasHours = !!bizProfile.business_hours;
  const hasDescription = !!bizProfile.description;
  
  // Kriteria untuk Meta Verified
  const verificationCriteria = [
    hasVerifiedBadge,           // Badge verified resmi
    hasWebsite,                 // Website bisnis
    hasEmail,                   // Email bisnis  
    hasCategory,                // Kategori bisnis
    hasDescription              // Deskripsi bisnis
  ];
  
  const score = verificationCriteria.filter(Boolean).length;
  
  // Meta Verified dengan kriteria ketat
  if (hasVerifiedBadge && score >= 4) {
    return { 
      verified: true, 
      type: '✅ META VERIFIED', 
      category: 'meta_verified',
      score: score,
      details: {
        website: hasWebsite,
        email: hasEmail,
        category: hasCategory,
        description: hasDescription,
        address: hasAddress,
        hours: hasHours
      }
    };
  } 
  // Business account premium
  else if (score >= 4) {
    return { 
      verified: false, 
      type: '🏢 BUSINESS PREMIUM', 
      category: 'premium_business',
      score: score,
      details: {
        website: hasWebsite,
        email: hasEmail,
        category: hasCategory,
        description: hasDescription,
        address: hasAddress,
        hours: hasHours
      }
    };
  }
  // Business account standar
  else if (score >= 3) {
    return { 
      verified: false, 
      type: '🏢 BUSINESS STANDARD', 
      category: 'standard_business',
      score: score,
      details: {
        website: hasWebsite,
        email: hasEmail,
        category: hasCategory,
        description: hasDescription
      }
    };
  }
  // Business account dasar
  else if (bizProfile.isBusiness || score >= 2) {
    return { 
      verified: false, 
      type: '🏢 BASIC BUSINESS', 
      category: 'basic_business',
      score: score,
      details: {
        website: hasWebsite,
        email: hasEmail,
        category: hasCategory
      }
    };
  }
  // Personal account
  else {
    return { 
      verified: false, 
      type: '👤 PERSONAL', 
      category: 'personal',
      score: score,
      details: {}
    };
  }
}

// Fungsi untuk membuat file hasil
function createResultFile(results, totalNumbers, source = 'Manual Input') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `hasil_cekbio_${timestamp}.txt`;
  
  let fileContent = `HASIL CEK BIO WHATSAPP\n`;
  fileContent += `Generated: ${new Date().toLocaleString('id-ID')}\n`;
  fileContent += `Sumber: ${source}\n`;
  fileContent += `Total: ${totalNumbers} nomor\n`;
  fileContent += `Terdaftar: ${results.filter(r => r.registered).length}\n`;
  fileContent += `Tidak terdaftar: ${results.filter(r => !r.registered).length}\n`;
  fileContent += `Dengan bio: ${results.filter(r => r.registered && r.bio && r.bio.length > 0).length}\n`;
  fileContent += `Business: ${results.filter(r => r.isBusiness).length}\n`;
  fileContent += `Meta Verified: ${results.filter(r => r.metaVerified).length}\n`;
  fileContent += `Meta Business: ${results.filter(r => r.metaBusiness).length}\n\n`;
  
  const registeredNumbers = results.filter(r => r.registered && r.bio && r.bio.length > 0);
  
  if (registeredNumbers.length > 0) {
    fileContent += `DETAIL NOMOR TERDAFTAR DENGAN BIO:\n`;
    fileContent += '='.repeat(60) + '\n';
    
    registeredNumbers.forEach((result, index) => {
      fileContent += `\n${index + 1}. +${result.number}\n`;
      fileContent += `   Bio: ${result.bio}\n`;
      fileContent += `   Update: ${formatTimestamp(result.setAt)}\n`;
      fileContent += `   Tipe: ${result.accountType}\n`;
      if (result.isBusiness) {
        fileContent += `   Verifikasi Score: ${result.verificationScore}/6\n`;
      }
      fileContent += `   Umur Bio: ${result.bioAge < 9999 ? result.bioAge + ' hari' : 'Tidak diketahui'}\n`;
      fileContent += '-'.repeat(60) + '\n';
    });
  }
  
  fs.writeFileSync(filename, fileContent);
  return filename;
}

// ==================== FITUR FOTO PROFIL BARU ====================

// Fungsi untuk mendapatkan foto profil
async function getProfilePicture(jid) {
  try {
    console.log(`🔄 Mencoba mengambil foto profil untuk: ${jid}`);
    
    // Coba beberapa metode untuk mendapatkan foto profil
    const profilePictureUrl = await whatsappSock.profilePictureUrl(jid, 'image');
    
    if (profilePictureUrl) {
      console.log(`✅ Foto profil ditemukan untuk: ${jid}`);
      return profilePictureUrl;
    } else {
      console.log(`❌ Foto profil tidak ditemukan untuk: ${jid}`);
      return null;
    }
  } catch (error) {
    console.log(`⚠️ Gagal mengambil foto profil untuk ${jid}:`, error.message);
    return null;
  }
}

// Fungsi untuk download foto profil
async function downloadProfilePicture(profilePictureUrl, filename) {
  try {
    const response = await fetch(profilePictureUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filename, Buffer.from(buffer));
    console.log(`✅ Foto profil disimpan: ${filename}`);
    return true;
  } catch (error) {
    console.log(`❌ Gagal download foto profil:`, error.message);
    return false;
  }
}

// Fungsi untuk mengirim foto profil ke Telegram
async function sendProfilePictures(ctx, topResults) {
  try {
    console.log(`🔄 Mengirim ${topResults.length} foto profil...`);
    
    for (let i = 0; i < Math.min(topResults.length, 3); i++) {
      const result = topResults[i];
      const jid = jidNormalizedUser(result.number + "@s.whatsapp.net");
      
      try {
        // Dapatkan URL foto profil
        const profilePictureUrl = await getProfilePicture(jid);
        
        if (profilePictureUrl) {
          // Download foto profil
          const filename = `profile_${result.number}_${Date.now()}.jpg`;
          const downloadSuccess = await downloadProfilePicture(profilePictureUrl, filename);
          
          if (downloadSuccess) {
            // Buat caption untuk foto
            const caption = `📸 *Foto Profil ${i + 1}*\n\n` +
                           `📱 *Nomor:* +${result.number}\n` +
                           `📝 *Bio:* ${result.bio || 'Tidak ada bio'}\n` +
                           `🏢 *Tipe:* ${result.accountType}\n` +
                           `⭐ *Score:* ${result.verificationScore}/6\n` +
                           `📅 *Umur Bio:* ${result.bioAge < 9999 ? result.bioAge + ' hari' : 'Tidak diketahui'}`;
            
            // Kirim foto ke Telegram
            await ctx.replyWithPhoto(
              { source: filename },
              { 
                caption: caption,
                parse_mode: 'Markdown'
              }
            );
            
            // Hapus file setelah dikirim
            setTimeout(() => {
              try {
                fs.unlinkSync(filename);
                console.log(`✅ File foto dihapus: ${filename}`);
              } catch (e) {
                console.log(`❌ Gagal menghapus file foto: ${e.message}`);
              }
            }, 5000);
            
            // Delay antar pengiriman foto
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.log(`❌ Gagal mengirim foto profil untuk +${result.number}:`, error.message);
        // Lanjut ke nomor berikutnya jika gagal
        continue;
      }
    }
    
    console.log(`✅ Selesai mengirim foto profil`);
  } catch (error) {
    console.log(`❌ Error dalam sendProfilePictures:`, error.message);
  }
}

// Initialize WhatsApp Socket
async function initializeWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();
    
    whatsappSock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    whatsappSock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      logSystem(`WhatsApp Connection: ${connection}`);

      if (connection === "open") {
        isWhatsAppConnected = true;
        pairingCode = null;
        pairingNumber = null;
        logSuccess('WhatsApp Connected Successfully!');
      } else if (connection === "close") {
        isWhatsAppConnected = false;
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        logWarning('WhatsApp Disconnected');
        if (shouldReconnect) {
          logInfo('Reconnecting WhatsApp...');
          setTimeout(() => initializeWhatsApp(), 5000);
        }
      }
    });

    whatsappSock.ev.on("creds.update", saveCreds);

    return whatsappSock;

  } catch (error) {
    logError(`WhatsApp init error: ${error}`);
    throw error;
  }
}

// Fungsi untuk request pairing code
async function requestPairingCode(number) {
  try {
    if (!whatsappSock) {
      logInfo('Initializing WhatsApp socket for pairing...');
      whatsappSock = await initializeWhatsApp();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const cleanNumber = number.replace(/[^0-9]/g, "");
    logInfo(`Requesting pairing code for: +${cleanNumber}`);
    
    const code = await whatsappSock.requestPairingCode(cleanNumber);
    
    pairingCode = code;
    pairingNumber = cleanNumber;
    
    logSuccess(`Pairing code received: ${code} for +${cleanNumber}`);
    return code;
    
  } catch (error) {
    logError(`Pairing code request failed: ${error}`);
    throw new Error(`Gagal request pairing code: ${error.message}`);
  }
}

// Start WhatsApp Connection
async function startWhatsApp() {
  try {
    logInfo('Starting WhatsApp Connection...');
    await initializeWhatsApp();
  } catch (error) {
    logError(`Failed to start WhatsApp: ${error}`);
  }
}

// ==================== PREMIUM COMMAND HANDLERS ====================

// Ultra Modern Start Command
bot.start(async (ctx) => {
  try {
    const isMember = await checkChannelMembership(ctx);
    
    if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
      return showChannelRequirement(ctx);
    }

    const isOwner = ctx.from.id.toString() === OWNER_ID;
    const isGroup = isGroupChat(ctx.chat.type);
    
    let welcomeText = createHeader("WHATSAPP BIO SCANNER", EMOJI.GEM);
    
    // Premium Features Card
    const premiumFeatures = [
      'Mass Bio Checking',
      'Business Account Detection', 
      'Meta Verification Scanner',
      'Bio Age Analysis',
      'Profile Photos (Top 3)',
      'Real-time Processing'
    ];
    
    welcomeText += createFeatureCard(premiumFeatures, "PREMIUM FEATURES");
    
    // Mode Info
    welcomeText += `\n${EMOJI.SETTINGS} *SYSTEM MODE:* `;
    welcomeText += groupOnlyMode ? `${EMOJI.GROUP} GROUP ONLY` : `${EMOJI.USER} HYBRID`;
    welcomeText += `\n`;

    // User Commands Section
    const userCommands = [
      '/cekbio [numbers] - Scan bio data',
      '/pairing - Connect WhatsApp',
      '/status - System status',
      '/logs - Check history',
      '/help - Usage guide'
    ];
    welcomeText += createSection("QUICK COMMANDS", userCommands, EMOJI.FLASH);

    // Owner Commands (Private only)
    if (isOwner && !isGroup) {
      const ownerCommands = [
        '/addaccess - Grant user access',
        '/removeaccess - Revoke access',
        '/listaccess - View users',
        '/enablegroup - Enable group',
        '/disablegroup - Disable group',
        '/grouponly - Group only mode',
        '/normalmode - Normal mode',
        '/setcooldown - Set cooldown',
        '/setmax - Set max numbers'
      ];
      welcomeText += createSection("OWNER CONTROLS", ownerCommands, EMOJI.CROWN);
    }

    // Usage Examples
    const examples = [
      '/cekbio 628123456789',
      '/cekbio 628123456789 628987654321'
    ];
    welcomeText += createSection("QUICK EXAMPLES", examples, EMOJI.ROCKET);

    // System Info
    const systemInfo = [
      `⚡ Limit: ${MAX_NUMBERS} numbers/request`,
      `⏰ Cooldown: ${COOLDOWN_TIME} seconds`,
      `📱 WhatsApp: ${isWhatsAppConnected ? EMOJI.SUCCESS + ' Connected' : EMOJI.ERROR + ' Disconnected'}`,
      `📢 Channel: ${REQUIRED_CHANNEL} ${EMOJI.VERIFIED}`
    ];
    welcomeText += createSection("SYSTEM INFO", systemInfo, EMOJI.INFO);

    await safeReply(ctx, welcomeText, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logError(`Start command error: ${error}`);
  }
});

// Enhanced Menu Command
bot.command('menu', async (ctx) => {
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  const isOwner = ctx.from.id.toString() === OWNER_ID;
  const isGroup = isGroupChat(ctx.chat.type);
  
  let menuText = createHeader("QUICK MENU", EMOJI.ROCKET);
  
  // Quick Actions
  const quickActions = [
    '/cekbio - Scan bio data',
    '/pairing - Connect WA',
    '/status - System status',
    '/logs - View history',
    '/help - Get help'
  ];
  menuText += createSection("QUICK ACTIONS", quickActions, EMOJI.FLASH);

  // Owner Tools
  if (isOwner && !isGroup) {
    const ownerTools = [
      '/addaccess - Add user',
      '/listaccess - List users',
      '/settings - Bot settings'
    ];
    menuText += createSection("OWNER TOOLS", ownerTools, EMOJI.CROWN);
  }

  // Live Status
  const liveStatus = [
    `⏰ Cooldown: ${COOLDOWN_TIME}s`,
    `🔢 Max: ${MAX_NUMBERS} numbers`,
    `📱 WA: ${isWhatsAppConnected ? EMOJI.SUCCESS + ' Connected' : EMOJI.ERROR + ' Disconnected'}`,
    `📢 Channel: ${REQUIRED_CHANNEL} ${EMOJI.VERIFIED}`
  ];
  menuText += createSection("LIVE STATUS", liveStatus, EMOJI.INFO);

  await safeReply(ctx, menuText, { parse_mode: 'Markdown' });
});

// Premium Help Command
bot.command('help', async (ctx) => {
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  let helpText = createHeader("PREMIUM GUIDE", EMOJI.STAR);
  
  // Usage Steps
  const usageSteps = [
    'Use /pairing to connect WhatsApp',
    'Use /cekbio [numbers] to scan',
    'Wait for processing to complete',
    'View results and download file',
    'Get profile photos of top 3 results'
  ];
  helpText += createSection("HOW TO USE", usageSteps, EMOJI.ROCKET);

  // Number Formats
  const numberFormats = [
    '628123456789',
    '081234567890', 
    '+628123456789'
  ];
  helpText += createSection("VALID FORMATS", numberFormats, EMOJI.PHONE);

  // Specifications
  const specs = [
    `Max ${MAX_NUMBERS} numbers/request`,
    `Cooldown ${COOLDOWN_TIME} seconds`,
    `All number formats supported`,
    `Business & Verified detection`,
    `${EMOJI.CAMERA} Profile photos (top 3)`,
    `${EMOJI.VERIFIED} Channel: ${REQUIRED_CHANNEL}`
  ];
  helpText += createSection("SPECIFICATIONS", specs, EMOJI.GEM);

  await safeReply(ctx, helpText, { parse_mode: 'Markdown' });
});

// Enhanced Pairing Command
bot.command('pairing', async (ctx) => {
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  if (isWhatsAppConnected) {
    return safeReply(ctx, 
      `${EMOJI.SUCCESS} *WHATSAPP CONNECTED!* ${EMOJI.SUCCESS}\n\n` +
      `${EMOJI.ROCKET} Ready to scan bios with /cekbio`,
      { parse_mode: 'Markdown' }
    );
  }

  const messageText = ctx.message.text;
  const numberText = messageText.replace('/pairing', '').trim();
  
  if (!numberText) {
    return safeReply(ctx,
      `${EMOJI.PHONE} *WHATSAPP PAIRING* ${EMOJI.PHONE}\n\n` +
      `${EMOJI.INFO} *Format:* \`/pairing 628123456789\`\n\n` +
      `${EMOJI.FLASH} *Requirements:*\n` +
      `${EMOJI.CHECK} Active WhatsApp number\n` +
      `${EMOJI.CHECK} Stable internet connection\n` +
      `${EMOJI.CHECK} Wait for code to appear`,
      { parse_mode: 'Markdown' }
    );
  }

  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
    
    const code = await requestPairingCode(numberText);
    
    await safeReply(ctx,
      `${EMOJI.LOCK} *PAIRING CODE* ${EMOJI.LOCK}\n\n` +
      `${EMOJI.PHONE} *Number:* +${pairingNumber}\n` +
      `${EMOJI.KEY} *Code:* \`${code}\`\n\n` +
      `${EMOJI.FLASH} *Quick Steps:*\n` +
      `1. Open WhatsApp\n` +
      `2. Settings → Linked Devices\n` +
      `3. Link a Device\n` +
      `4. Enter code: *${code}*\n\n` +
      `${EMOJI.CLOCK} *Expires in 30 seconds*\n` +
      `${EMOJI.LOADING} Awaiting connection...`,
      { parse_mode: 'Markdown' }
    );

    let checkCount = 0;
    const maxChecks = 30;
    
    const checkInterval = setInterval(async () => {
      checkCount++;
      
      if (isWhatsAppConnected) {
        clearInterval(checkInterval);
        await safeReply(ctx, 
          `${EMOJI.TROPHY} *WHATSAPP CONNECTED!* ${EMOJI.TROPHY}\n\n` +
          `${EMOJI.ROCKET} Ready to use /cekbio for bio scanning.`,
          { parse_mode: 'Markdown' }
        );
      } else if (checkCount >= maxChecks) {
        clearInterval(checkInterval);
        await safeReply(ctx, 
          `${EMOJI.ERROR} *PAIRING TIMEOUT*\n\n` +
          `${EMOJI.INFO} Try again with /pairing`,
          { parse_mode: 'Markdown' }
        );
      }
    }, 1000);

  } catch (error) {
    logError(`Pairing error: ${error}`);
    safeReply(ctx, 
      `${EMOJI.ERROR} *PAIRING FAILED*\n\n` +
      `${EMOJI.WARNING} Error: ${error.message}\n\n` +
      `${EMOJI.FLASH} *Ensure:*\n` +
      `${EMOJI.CHECK} Active WhatsApp number\n` +
      `${EMOJI.CHECK} Correct number format\n` +
      `${EMOJI.CHECK} Stable internet connection`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Command /cekbio yang lebih cepat
bot.command('cekbio', async (ctx) => {
  // Cek channel membership dulu
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  // Cek cooldown
  const cooldown = checkCooldown(ctx.from.id);
  if (!cooldown.allowed) {
    return safeReply(ctx, 
      `${EMOJI.CLOCK} *COOLDOWN ACTIVE*\n\n` +
      `Tunggu *${cooldown.remaining} detik* sebelum menggunakan lagi.`,
      { parse_mode: 'Markdown' }
    );
  }

  if (!isWhatsAppConnected) {
    return safeReply(ctx, 
      `${EMOJI.ERROR} *WHATSAPP NOT CONNECTED*\n\n` +
      'Gunakan /pairing dulu untuk menghubungkan WhatsApp.',
      { parse_mode: 'Markdown' }
    );
  }

  const messageText = ctx.message.text;
  const numbersText = messageText.replace('/cekbio', '').trim();
  const numbers = numbersText.split(/[\s,\n]+/).filter(num => num.length > 0);
  
  if (numbers.length === 0) {
    return safeReply(ctx,
      `${EMOJI.SEARCH} *BIO SCANNER*\n\n` +
      `${EMOJI.ERROR} *Format salah!*\n\n` +
      `${EMOJI.INFO} *Contoh:*\n` +
      '`/cekbio 628123456789 628987654321`\n\n' +
      `${EMOJI.FLASH} *Info:*\n` +
      `• Maksimal ${MAX_NUMBERS} nomor\n` +
      '• Pisahkan dengan spasi/koma\n' +
      '• Support semua format nomor\n' +
      `• ${EMOJI.CAMERA} Dapat foto profil 3 top result`,
      { parse_mode: 'Markdown' }
    );
  }

  if (numbers.length > MAX_NUMBERS) {
    return safeReply(ctx, 
      `${EMOJI.ERROR} *TOO MANY NUMBERS*\n\n` +
      `Maksimal: *${MAX_NUMBERS}* nomor\n` +
      `Dikirim: *${numbers.length}* nomor\n\n` +
      `Kurangi jumlah nomor.`,
      { parse_mode: 'Markdown' }
    );
  }

  // Format nomor
  const validNumbers = numbers.slice(0, MAX_NUMBERS).map(num => {
    let cleanNum = num.replace(/\D/g, '');
    if (cleanNum.startsWith('0')) cleanNum = '62' + cleanNum.substring(1);
    if (cleanNum.startsWith('8')) cleanNum = '62' + cleanNum;
    return cleanNum;
  }).filter(num => num.length >= 10 && num.length <= 15);

  if (validNumbers.length === 0) {
    return safeReply(ctx, 
      `${EMOJI.ERROR} *NO VALID NUMBERS*\n\n` +
      'Pastikan format nomor benar:\n' +
      '• 628123456789\n' +
      '• 081234567890\n' +
      '• +628123456789',
      { parse_mode: 'Markdown' }
    );
  }

  await processCekBio(ctx, validNumbers, 'manual');
});

// Command /status yang informatif
bot.command('status', async (ctx) => {
  // Cek channel membership dulu
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  const modeText = groupOnlyMode ? `${EMOJI.GROUP} GROUP ONLY` : `${EMOJI.USER} NORMAL`;
  const waStatus = isWhatsAppConnected ? `${EMOJI.SUCCESS} Connected` : `${EMOJI.ERROR} Disconnected`;
  
  const statusText = 
    `${EMOJI.CHART} *SYSTEM STATUS* ${EMOJI.CHART}\n\n` +
    `${EMOJI.SUCCESS} *Telegram Bot:* ✅ Connected\n` +
    `${EMOJI.PHONE} *WhatsApp:* ${waStatus}\n` +
    `${EMOJI.SETTINGS} *Mode:* ${modeText}\n` +
    `${EMOJI.USER} *User Access:* ${allowedUsers.size} user\n` +
    `${EMOJI.GROUP} *Group Mode:* ${groupMode.size} group\n` +
    `${EMOJI.CLOCK} *Cooldown:* ${COOLDOWN_TIME}s\n` +
    `${EMOJI.FLASH} *Max Numbers:* ${MAX_NUMBERS}\n` +
    `${EMOJI.CAMERA} *Photo Feature:* ✅ Active\n` +
    `${EMOJI.VERIFIED} *Required Channel:* ${REQUIRED_CHANNEL}\n` +
    `${EMOJI.INFO} *Server Time:* ${new Date().toLocaleString('id-ID')}`;
  
  await safeReply(ctx, statusText, { parse_mode: 'Markdown' });
});

// Command /logs yang rapi
bot.command('logs', async (ctx) => {
  // Cek channel membership dulu
  const isMember = await checkChannelMembership(ctx);
  if (!isMember && ctx.from.id.toString() !== OWNER_ID) {
    return showChannelRequirement(ctx);
  }

  if (!validateAccess(ctx)) return;

  const logs = loadLogHistory();
  const userLogs = logs.filter(log => 
    ctx.from.id.toString() === OWNER_ID || log.userId === ctx.from.id.toString()
  ).slice(-10);

  if (userLogs.length === 0) {
    return safeReply(ctx, 
      `${EMOJI.CHART} *SCAN HISTORY*\n\n` +
      'Belum ada riwayat scan.',
      { parse_mode: 'Markdown' }
    );
  }

  let logText = `${EMOJI.CHART} *RECENT HISTORY* ${EMOJI.CHART}\n\n`;
  
  userLogs.reverse().forEach((log, index) => {
    const time = new Date(log.timestamp).toLocaleString('id-ID');
    logText += `*${index + 1}. ${time}*\n`;
    logText += `┌─ ${EMOJI.USER} User: ${log.username}\n`;
    logText += `├─ ${EMOJI.PHONE} Total: ${log.numbersCount} nomor\n`;
    logText += `├─ ${EMOJI.SUCCESS} Registered: ${log.registered}\n`;
    logText += `├─ ${EMOJI.SEARCH} With Bio: ${log.withBio}\n`;
    logText += `├─ ${EMOJI.BUSINESS} Business: ${log.business}\n`;
    logText += `└─ ${EMOJI.VERIFIED} Verified: ${log.verified}\n\n`;
  });

  await safeReply(ctx, logText, { parse_mode: 'Markdown' });
});

// ==================== ENHANCED CEKBIO PROCESSING ====================

async function processCekBio(ctx, validNumbers, source = 'manual') {
  let filename = null;
  let progressMessage = null;
  let lastProgressUpdate = 0;

  try {
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
    
    // Stylish progress message
    progressMessage = await safeReply(ctx,
      `${EMOJI.ROCKET} *SCANNING INITIATED* ${EMOJI.ROCKET}\n\n` +
      `${EMOJI.INFO} *Scan Details:*\n` +
      `┌─ ${EMOJI.PHONE} Total: ${validNumbers.length} numbers\n` +
      `├─ ${EMOJI.FILE} Source: Manual Input\n` +
      `├─ ${EMOJI.CAMERA} Photos: Top 3 results\n` +
      `└─ ${EMOJI.CLOCK} ETA: ${Math.ceil(validNumbers.length * 1.5)}s\n\n` +
      `${EMOJI.LOADING} *Premium scanning in progress...*`,
      { parse_mode: 'Markdown' }
    );
    
    let results = [];
    let processedCount = 0;

    // Enhanced progress update
    async function updateProgress(force = false) {
      const now = Date.now();
      if (force || now - lastProgressUpdate > 5000) {
        if (progressMessage) {
          try {
            await ctx.telegram.editMessageText(
              progressMessage.chat.id,
              progressMessage.message_id,
              null,
              `${EMOJI.LOADING} *SCANNING IN PROGRESS* ${EMOJI.LOADING}\n\n` +
              `${EMOJI.CHART} *Progress:* ${processedCount}/${validNumbers.length} numbers\n` +
              `${EMOJI.CLOCK} *Remaining:* ${Math.ceil((validNumbers.length - processedCount) * 0.3)}s\n\n` +
              `${EMOJI.FLASH} *Do not close the app...*`,
              { parse_mode: 'Markdown' }
            );
            lastProgressUpdate = now;
          } catch (error) {
            // Ignore edit errors
          }
        }
      }
    }

    // Process dengan Promise.all untuk lebih cepat
    const processBatch = async (batch) => {
      const promises = batch.map(async (num) => {
        try {
          const jid = jidNormalizedUser(num + "@s.whatsapp.net");
          const [waCheck] = await whatsappSock.onWhatsApp(jid);
          
          if (!waCheck?.exists) {
            return { number: num, registered: false };
          }

          let bioData = "";
          let setAt = null;
          let isBusiness = false;
          let metaVerified = false;
          let metaBusiness = false;
          let accountType = '👤 Personal';
          let verificationScore = 0;

          // Ambil bio dan business profile secara parallel
          const [statusResult, biz] = await Promise.allSettled([
            whatsappSock.fetchStatus(jid),
            whatsappSock.getBusinessProfile(jid)
          ]);

          // Process bio
          if (statusResult.status === 'fulfilled' && statusResult.value) {
            const status = statusResult.value;
            if (status.status !== undefined) {
              bioData = status.status || "";
              setAt = status.setAt || null;
            } else if (Array.isArray(status) && status[0]?.status) {
              bioData = status[0].status.status || "";
              setAt = status[0].status.setAt || null;
            }
          }

          // Process business profile
          if (biz.status === 'fulfilled' && biz.value) {
            isBusiness = true;
            const verification = checkMetaVerification(biz.value);
            accountType = verification.type;
            verificationScore = verification.score;
            
            if (verification.verified) {
              metaVerified = true;
              metaBusiness = true;
            } else if (verification.category.includes('business')) {
              metaBusiness = true;
            }
          }

          const bioAge = calculateBioAge(setAt);

          return {
            number: num,
            registered: true,
            bio: bioData,
            setAt: setAt,
            isBusiness: isBusiness,
            metaVerified: metaVerified,
            metaBusiness: metaBusiness,
            accountType: accountType,
            verificationScore: verificationScore,
            bioAge: bioAge
          };
          
        } catch (error) {
          return { number: num, registered: false, error: true };
        }
      });

      return await Promise.all(promises);
    };

    // Process dalam batch kecil untuk kecepatan
    const BATCH_SIZE = 5;
    for (let i = 0; i < validNumbers.length; i += BATCH_SIZE) {
      const batch = validNumbers.slice(i, i + BATCH_SIZE);
      const batchResults = await processBatch(batch);
      results.push(...batchResults);
      processedCount += batch.length;
      
      // Update progress dengan rate limiting
      if (processedCount % 20 === 0 || processedCount === validNumbers.length) {
        await updateProgress(processedCount === validNumbers.length);
      }
      
      // Delay kecil antara batch
      if (i + BATCH_SIZE < validNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // Hapus pesan progress setelah selesai
    if (progressMessage) {
      try {
        await ctx.telegram.deleteMessage(progressMessage.chat.id, progressMessage.message_id);
      } catch (error) {
        // Ignore delete errors
      }
      progressMessage = null;
    }

    // Add to log history
    const username = ctx.from.username || `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`;
    addLogEntry(ctx.from.id, username, validNumbers.length, results, source);

    // Filter dan urutkan hasil
    const registeredWithBio = results
      .filter(r => r.registered && r.bio && r.bio.length > 0)
      .sort((a, b) => {
        if (a.metaVerified && !b.metaVerified) return -1;
        if (!a.metaVerified && b.metaVerified) return 1;
        if (a.metaBusiness && !b.metaBusiness) return -1;
        if (!a.metaBusiness && b.metaBusiness) return 1;
        return b.verificationScore - a.verificationScore;
      });

    const registeredCount = results.filter(r => r.registered).length;
    const businessCount = results.filter(r => r.isBusiness).length;
    const verifiedCount = results.filter(r => r.metaVerified).length;
    const metaBusinessCount = results.filter(r => r.metaBusiness).length;
    const withBioCount = registeredWithBio.length;

    // Buat file hasil
    filename = createResultFile(results, validNumbers.length, 'Manual Input');
    
    // Premium results display
    let resultText = createHeader("SCAN RESULTS", EMOJI.TROPHY);
    
    // Statistics Box
    const stats = [
      `${EMOJI.PHONE} Total: ${validNumbers.length} numbers`,
      `${EMOJI.SUCCESS} Registered: ${registeredCount}`,
      `${EMOJI.SEARCH} With Bio: ${withBioCount}`,
      `${EMOJI.BUSINESS} All Business: ${businessCount}`,
      `${EMOJI.VERIFIED} Meta Verified: ${verifiedCount}`,
      `${EMOJI.GEM} Meta Business: ${metaBusinessCount}`
    ];
    resultText += createStatsBox(stats);
    
    if (registeredWithBio.length > 0) {
      resultText += `\n${EMOJI.MEDAL} *TOP RESULTS:*\n`;
      
      registeredWithBio.slice(0, 5).forEach((result, index) => {
        const medal = index === 0 ? EMOJI.TROPHY : index === 1 ? EMOJI.MEDAL : EMOJI.STAR;
        const bioPreview = result.bio.length > 25 ? result.bio.substring(0, 25) + '...' : result.bio;
        const ageInfo = result.bioAge < 9999 ? ` (${result.bioAge}d)` : '';
        
        resultText += `\n${medal} ${result.accountType} *+${result.number}*${ageInfo}\n`;
        resultText += `   ${EMOJI.SEARCH} ${bioPreview}\n`;
        if (result.isBusiness) {
          resultText += `   ${EMOJI.CHART} Score: ${result.verificationScore}/6\n`;
        }
      });
      
      if (registeredWithBio.length > 5) {
        resultText += `\n${EMOJI.FILE} *${registeredWithBio.length - 5} more results in file*\n`;
      }
    } else {
      resultText += `\n${EMOJI.WARNING} *No bios found in this scan*\n`;
    }

    // Scan Info
    const scanInfo = [
      `${EMOJI.FILE} Source: Manual Input`,
      `${EMOJI.USER} User: ${username}`,
      `${EMOJI.CLOCK} Time: ${new Date().toLocaleString('id-ID')}`
    ];
    resultText += createSection("SCAN INFO", scanInfo, EMOJI.INFO);

    // Send results
    await safeReply(ctx, resultText, { parse_mode: 'Markdown' });
    
    // Send profile photos for top results
    if (registeredWithBio.length > 0) {
      const topResults = registeredWithBio.slice(0, 3);
      await safeReply(ctx,
        `${EMOJI.CAMERA} *Sending profile photos for top 3 results...*`,
        { parse_mode: 'Markdown' }
      );
      await sendProfilePictures(ctx, topResults);
    }
    
    // Send comprehensive file
    if (registeredWithBio.length > 0) {
      await ctx.replyWithDocument(
        { source: filename },
        { 
          caption: `${EMOJI.FILE} *COMPREHENSIVE RESULTS* ${EMOJI.FILE}\n\n` +
                  `${EMOJI.CHART} ${validNumbers.length} numbers | ${withBioCount} with bio\n` +
                  `${EMOJI.VERIFIED} ${verifiedCount} Meta Verified | ${EMOJI.BUSINESS} ${metaBusinessCount} Meta Business\n` +
                  `${EMOJI.USER} ${username} | ${EMOJI.CLOCK} ${new Date().toLocaleString('id-ID')}`,
          parse_mode: 'Markdown'
        }
      );
    }

    // Cleanup file
    setTimeout(() => {
      try {
        if (filename) {
          fs.unlinkSync(filename);
          logSuccess(`Cleaned up file: ${filename}`);
        }
      } catch (e) {
        logError(`Cleanup error: ${e.message}`);
      }
    }, 10000);

  } catch (error) {
    if (progressMessage) {
      try {
        await ctx.telegram.deleteMessage(progressMessage.chat.id, progressMessage.message_id);
      } catch (e) {
        // Ignore delete errors
      }
    }
    
    logError(`Cekbio processing error: ${error}`);
    safeReply(ctx, 
      `${EMOJI.ERROR} *SCAN FAILED*\n\n` +
      `${EMOJI.INFO} Please try the scan again.`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ==================== ENHANCED OWNER COMMANDS ====================

bot.command('addaccess', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  const messageText = ctx.message.text;
  const userId = messageText.replace('/addaccess', '').trim();
  
  if (!userId) {
    return safeReply(ctx, 
      `${EMOJI.USER} *GRANT ACCESS* ${EMOJI.USER}\n\n` +
      `${EMOJI.INFO} *Format:* \`/addaccess USER_ID\`\n\n` +
      `${EMOJI.FLASH} *Example:* \`/addaccess 123456789\``,
      { parse_mode: 'Markdown' }
    );
  }

  allowedUsers.add(userId);
  await safeReply(ctx, 
    `${EMOJI.SUCCESS} *ACCESS GRANTED* ${EMOJI.SUCCESS}\n\n` +
    `${EMOJI.USER} User ID: ${userId}\n` +
    `${EMOJI.ROCKET} Now has premium access.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('removeaccess', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  const messageText = ctx.message.text;
  const userId = messageText.replace('/removeaccess', '').trim();
  
  if (!userId) {
    return safeReply(ctx, 
      `${EMOJI.USER} *REVOKE ACCESS* ${EMOJI.USER}\n\n` +
      `${EMOJI.INFO} *Format:* \`/removeaccess USER_ID\``,
      { parse_mode: 'Markdown' }
    );
  }

  if (userId === OWNER_ID) {
    return safeReply(ctx, `${EMOJI.ERROR} Cannot remove owner access.`);
  }

  allowedUsers.delete(userId);
  await safeReply(ctx, 
    `${EMOJI.SUCCESS} *ACCESS REVOKED* ${EMOJI.SUCCESS}\n\n` +
    `${EMOJI.USER} User ID: ${userId}\n` +
    `${EMOJI.LOCK} Access successfully removed.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('listaccess', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  const userList = Array.from(allowedUsers).join('\n');
  await safeReply(ctx, 
    `${EMOJI.USER} *USERS WITH ACCESS:*\n\n${userList}`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('enablegroup', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  if (ctx.chat.type === 'private') {
    return safeReply(ctx, `${EMOJI.ERROR} This command can only be used in groups.`);
  }

  groupMode.add(ctx.chat.id.toString());
  await safeReply(ctx, 
    `${EMOJI.SUCCESS} *BOT ENABLED* ${EMOJI.SUCCESS}\n\n` +
    `${EMOJI.GROUP} Bot is now active in this group.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('disablegroup', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  if (ctx.chat.type === 'private') {
    return safeReply(ctx, `${EMOJI.ERROR} This command can only be used in groups.`);
  }

  groupMode.delete(ctx.chat.id.toString());
  await safeReply(ctx, 
    `${EMOJI.ERROR} *BOT DISABLED* ${EMOJI.ERROR}\n\n` +
    `${EMOJI.GROUP} Bot is no longer active in this group.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('grouponly', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  groupOnlyMode = true;
  await safeReply(ctx, 
    `${EMOJI.GROUP} *GROUP ONLY MODE* ${EMOJI.GROUP}\n\n` +
    `${EMOJI.INFO} Bot now works only in authorized groups.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('normalmode', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  groupOnlyMode = false;
  await safeReply(ctx, 
    `${EMOJI.USER} *NORMAL MODE* ${EMOJI.USER}\n\n` +
    `${EMOJI.INFO} Bot now works in private chat (authorized users) and groups.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('setcooldown', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  const messageText = ctx.message.text;
  const seconds = parseInt(messageText.replace('/setcooldown', '').trim());
  
  if (!seconds || seconds < 5 || seconds > 3600) {
    return safeReply(ctx, 
      `${EMOJI.CLOCK} *SET COOLDOWN* ${EMOJI.CLOCK}\n\n` +
      `${EMOJI.INFO} *Format:* \`/setcooldown [seconds]\`\n\n` +
      `${EMOJI.FLASH} *Limits:*\n` +
      `${EMOJI.BULLET} Min: 5 seconds\n` +
      `${EMOJI.BULLET} Max: 3600 seconds (1 hour)`,
      { parse_mode: 'Markdown' }
    );
  }

  COOLDOWN_TIME = seconds;
  saveConfig();
  await safeReply(ctx, 
    `${EMOJI.SUCCESS} *COOLDOWN UPDATED* ${EMOJI.SUCCESS}\n\n` +
    `${EMOJI.CLOCK} Cooldown set to ${seconds} seconds.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('setmax', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  const messageText = ctx.message.text;
  const maxNum = parseInt(messageText.replace('/setmax', '').trim());
  
  if (!maxNum || maxNum < 10 || maxNum > 10000) {
    return safeReply(ctx, 
      `${EMOJI.FLASH} *SET MAX NUMBERS* ${EMOJI.FLASH}\n\n` +
      `${EMOJI.INFO} *Format:* \`/setmax [amount]\`\n\n` +
      `${EMOJI.FLASH} *Limits:*\n` +
      `${EMOJI.BULLET} Min: 10 numbers\n` +
      `${EMOJI.BULLET} Max: 10000 numbers`,
      { parse_mode: 'Markdown' }
    );
  }

  MAX_NUMBERS = maxNum;
  saveConfig();
  await safeReply(ctx, 
    `${EMOJI.SUCCESS} *MAX NUMBERS UPDATED* ${EMOJI.SUCCESS}\n\n` +
    `${EMOJI.FLASH} Max numbers per request set to ${maxNum}.`,
    { parse_mode: 'Markdown' }
  );
});

bot.command('settings', async (ctx) => {
  if (ctx.from.id.toString() !== OWNER_ID) {
    return safeReply(ctx, `${EMOJI.LOCK} Owner only command.`);
  }

  let settingsText = `${EMOJI.SETTINGS} *BOT SETTINGS* ${EMOJI.SETTINGS}\n\n`;
  
  settingsText += `${EMOJI.INFO} *Current Status:*\n`;
  const currentStatus = [
    `${EMOJI.SETTINGS} Mode: ${groupOnlyMode ? 'GROUP ONLY' : 'NORMAL'}`,
    `${EMOJI.CLOCK} Cooldown: ${COOLDOWN_TIME}s`,
    `${EMOJI.FLASH} Max Numbers: ${MAX_NUMBERS}`,
    `${EMOJI.PHONE} WA Status: ${isWhatsAppConnected ? EMOJI.SUCCESS + ' Connected' : EMOJI.ERROR + ' Disconnected'}`,
    `${EMOJI.USER} User Access: ${allowedUsers.size} user`,
    `${EMOJI.GROUP} Group Mode: ${groupMode.size} group`,
    `${EMOJI.CAMERA} Photo Feature: ✅ Active`,
    `${EMOJI.VERIFIED} Required Channel: ${REQUIRED_CHANNEL}`
  ];
  
  settingsText += createSection("Current Status", currentStatus, EMOJI.INFO);
  settingsText += `\n`;

  settingsText += `${EMOJI.SETTINGS} *Change Settings:*\n`;
  const settingCommands = [
    '/setcooldown [seconds] - Change cooldown',
    '/setmax [amount] - Change max numbers',
    '/grouponly - Group only mode',
    '/normalmode - Normal mode'
  ];
  
  settingsText += createSection("Change Settings", settingCommands, EMOJI.SETTINGS);

  await safeReply(ctx, settingsText, { parse_mode: 'Markdown' });
});

// ==================== ERROR HANDLING ====================

bot.catch((err, ctx) => {
  const userId = ctx.from?.id;
  
  if (err.response && err.response.error_code === 403) {
    logWarning(`Bot blocked by user: ${userId}`);
    return;
  }
  
  logError(`Error from user ${userId}: ${err.message}`);
});

process.on('uncaughtException', (error) => {
  if (error.response && error.response.error_code === 403) return;
  logError(`Uncaught Exception: ${error}`);
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason.response && reason.response.error_code === 403) return;
  logError(`Unhandled Rejection: ${reason}`);
});

// ==================== START BOT WITH STYLE ====================

async function startBot() {
  try {
    logSystem('🚀 INITIALIZING PREMIUM BOT...');
    loadConfig();
    await bot.launch();
    logSuccess('✅ TELEGRAM BOT STARTED!');
    
    await startWhatsApp();
    
    // Stylish startup message
    console.log(`\n${COLORS.MAGENTA}╔══════════════════════════════════════╗`);
    console.log(`║           ${EMOJI.ROCKET} BOT READY ${EMOJI.ROCKET}            ║`);
    console.log(`╚══════════════════════════════════════╝${COLORS.RESET}`);
    console.log(`${COLORS.CYAN}${EMOJI.CROWN}  Owner: ${OWNER_ID}`);
    console.log(`${COLORS.GREEN}${EMOJI.FLASH}  Max Numbers: ${MAX_NUMBERS}`);
    console.log(`${COLORS.YELLOW}${EMOJI.CLOCK}  Cooldown: ${COOLDOWN_TIME}s`);
    console.log(`${COLORS.BLUE}${EMOJI.CAMERA}  Profile Photos: ✅ Active`);
    console.log(`${COLORS.MAGENTA}${EMOJI.VERIFIED}  Channel: ${REQUIRED_CHANNEL}`);
    console.log(`${COLORS.CYAN}${EMOJI.GEM}  Premium Features: ✅ Enabled${COLORS.RESET}\n`);
    
  } catch (error) {
    logError(`Bot startup failed: ${error}`);
  }
}

// Start the premium bot
startBot();