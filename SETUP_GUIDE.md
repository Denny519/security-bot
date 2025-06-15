# 🚀 PANDUAN SETUP SECURITY BOT

## 📋 PERSYARATAN SISTEM

### **Software yang Dibutuhkan:**
- ✅ **Node.js** v16.9.0 atau lebih baru
- ✅ **npm** (biasanya sudah termasuk dengan Node.js)
- ✅ **Git** (untuk clone repository)
- ✅ **Text Editor** (VS Code recommended)

### **Akun yang Dibutuhkan:**
- ✅ **Discord Account** 
- ✅ **Discord Developer Portal** access

---

## 🔧 LANGKAH 1: SETUP DISCORD BOT

### **1.1 Buat Discord Application**
1. Buka [Discord Developer Portal](https://discord.com/developers/applications)
2. Klik **"New Application"**
3. Beri nama aplikasi (contoh: "Security Bot")
4. Klik **"Create"**

### **1.2 Setup Bot**
1. Di sidebar kiri, klik **"Bot"**
2. Klik **"Add Bot"** → **"Yes, do it!"**
3. **PENTING**: Copy **Token** bot (simpan dengan aman!)
4. Scroll ke bawah ke **"Privileged Gateway Intents"**
5. Aktifkan:
   - ✅ **Message Content Intent**
   - ✅ **Server Members Intent**

### **1.3 Setup OAuth2**
1. Di sidebar kiri, klik **"OAuth2"** → **"URL Generator"**
2. **Scopes**: Pilih `bot` dan `applications.commands`
3. **Bot Permissions**: Pilih:
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Manage Messages
   - ✅ Kick Members
   - ✅ Ban Members
   - ✅ Moderate Members
   - ✅ Manage Roles
   - ✅ View Audit Log
4. Copy **Generated URL** dan buka di browser
5. Pilih server dan klik **"Authorize"**

---

## 💻 LANGKAH 2: SETUP PROJECT

### **2.1 Clone/Download Project**
```bash
# Jika menggunakan Git
git clone <repository-url>
cd security-bot

# Atau download ZIP dan extract
```

### **2.2 Install Dependencies**
```bash
npm install
```

### **2.3 Setup Environment Variables**
```bash
# Copy template environment
cp .env.example .env
```

Edit file `.env` dengan text editor:
```env
# Paste token bot dari Discord Developer Portal
DISCORD_TOKEN=your_bot_token_here

# Application ID dari Discord Developer Portal (General Information)
CLIENT_ID=your_application_id_here

# Optional: Server ID untuk testing (klik kanan server → Copy ID)
GUILD_ID=your_test_server_id_here
```

---

## 🚀 LANGKAH 3: DEPLOY & JALANKAN

### **3.1 Deploy Slash Commands**
```bash
npm run deploy
```
**Output yang diharapkan:**
```
Started refreshing application (/) commands.
Successfully reloaded application (/) commands.
```

### **3.2 Start Bot**
```bash
npm start
```
**Output yang diharapkan:**
```
[2023-12-15T10:30:00.000Z] INFO: Security Bot is online as YourBot#1234
[2023-12-15T10:30:00.000Z] INFO: Bot activity and status set successfully
```

### **3.3 Test Bot**
Di Discord server, coba command:
```
/ping
/status
/help
```

---

## 🛠️ DEVELOPMENT MODE

### **Untuk Development:**
```bash
npm run dev
```
Ini akan menggunakan nodemon untuk auto-restart saat ada perubahan code.

### **Scripts Tersedia:**
```bash
npm start        # Start production bot
npm run dev      # Development mode dengan auto-restart
npm run deploy   # Deploy slash commands
npm test         # Run test suite
npm run lint     # Check code quality
npm run format   # Format code dengan Prettier
npm run check    # Run lint + test
```

---

## ⚙️ KONFIGURASI LANJUTAN

### **4.1 Konfigurasi Bot**
Edit file `config.js` untuk mengubah pengaturan:

```javascript
// Contoh konfigurasi spam detection
spam: {
    enabled: true,
    maxDuplicateMessages: 1,
    cooldown: 10000 // 10 detik
},

// Contoh konfigurasi link filtering
links: {
    enabled: true,
    whitelist: ['discord.gg', 'github.com', 'youtube.com']
}
```

### **4.2 Runtime Configuration**
Gunakan command `/config` di Discord untuk mengubah pengaturan tanpa restart:
```
/config setting:spam value:true
/config setting:links value:false
```

### **4.3 Logging Configuration**
Edit file `logger.js` atau set environment variables:
```env
LOG_LEVEL=info
LOG_FILE=./logs/security-bot.log
```

---

## 🔍 TROUBLESHOOTING

### **❌ Bot tidak online**
**Solusi:**
1. Cek token di `.env` file
2. Pastikan bot sudah di-invite ke server
3. Cek console untuk error messages

### **❌ Slash commands tidak muncul**
**Solusi:**
1. Jalankan `npm run deploy` lagi
2. Tunggu 1-5 menit (global commands butuh waktu)
3. Restart Discord client
4. Cek bot permissions di server

### **❌ Permission errors**
**Solusi:**
1. Cek role bot di server settings
2. Pastikan bot role di atas role yang ingin dimoderate
3. Cek individual channel permissions

### **❌ Commands tidak berfungsi**
**Solusi:**
1. Cek console untuk error logs
2. Pastikan user punya permission yang dibutuhkan
3. Cek bot permissions untuk command tersebut

---

## 📊 MONITORING & MAINTENANCE

### **5.1 Monitoring Bot**
```bash
# Cek status bot
/status

# Cek statistics (admin only)
/stats

# Cek logs
tail -f logs/security-bot.log
```

### **5.2 Maintenance Commands**
```bash
# Reload commands tanpa restart
/reload type:commands

# Reload configuration
/reload type:config

# Cleanup cache
/cleanup

# Maintenance mode
/maintenance enable:true reason:Update
```

### **5.3 Backup & Recovery**
```bash
# Backup configuration
cp config.js config.backup.js

# Backup logs
cp -r logs/ logs.backup/

# Backup database (jika menggunakan database)
# Akan ditambahkan di versi mendatang
```

---

## 🔒 KEAMANAN

### **6.1 Security Best Practices**
- ✅ **Jangan share token bot** di public
- ✅ **Gunakan .env file** untuk credentials
- ✅ **Regular update dependencies**: `npm audit fix`
- ✅ **Monitor logs** untuk aktivitas mencurigakan
- ✅ **Backup regular** configuration dan data

### **6.2 Production Deployment**
```bash
# Install PM2 untuk production
npm install -g pm2

# Start dengan PM2
pm2 start index.js --name "security-bot"

# Auto-restart on system reboot
pm2 startup
pm2 save
```

---

## 📞 SUPPORT

### **Jika Butuh Bantuan:**
1. 📖 **Baca dokumentasi** di `README.md`
2. 🔍 **Cek troubleshooting** di atas
3. 📝 **Buat issue** di GitHub repository
4. 💬 **Join Discord server** untuk support

### **Useful Links:**
- 📚 [Discord.js Documentation](https://discord.js.org/)
- 🔧 [Discord Developer Portal](https://discord.com/developers/)
- 📖 [Node.js Documentation](https://nodejs.org/docs/)

---

## ✅ CHECKLIST SETUP

```
□ Node.js v16.9.0+ installed
□ Discord bot created di Developer Portal
□ Bot token copied ke .env file
□ Bot invited ke server dengan permissions
□ Dependencies installed (npm install)
□ Commands deployed (npm run deploy)
□ Bot started successfully (npm start)
□ Commands tested di Discord (/ping, /status)
□ Configuration reviewed (config.js)
□ Logs working (check console output)
```

**Jika semua checklist ✅, bot Anda siap digunakan!** 🎉

---

*Setup guide ini akan terus diupdate seiring pengembangan fitur baru.*
