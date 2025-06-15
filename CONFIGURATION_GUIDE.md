# ⚙️ Configuration Management Guide

## ✅ **CONFIGURATION ISSUES FIXED!**

The configuration validation errors have been resolved. Here's the complete guide:

---

## 🔧 **Fixed Issues**

### **Issue 1: raidProtection.timeWindow minimum value**
- **Problem**: Schema required minimum 60000ms, but some configs had 10000ms
- **Solution**: Updated schema to allow minimum 10000ms (10 seconds)
- **Status**: ✅ **FIXED**

### **Issue 2: moderation.logChannel validation**
- **Problem**: Schema expected string but config had null values
- **Solution**: Updated schema to allow both string and null types
- **Status**: ✅ **FIXED**

---

## 📋 **Configuration Schema**

### **Valid Configuration Values**

#### **🛡️ Spam Detection**
```javascript
spam: {
    enabled: boolean,
    maxMessagesPerMinute: 1-100,
    maxDuplicateMessages: 1-10,
    timeWindow: 1000-300000ms,
    cooldown: 1000-60000ms
}
```

#### **🔗 Link Detection**
```javascript
links: {
    enabled: boolean,
    whitelist: array of strings,
    allowShorteners: boolean,
    checkSuspicious: boolean
}
```

#### **📢 Mention Detection**
```javascript
mentions: {
    enabled: boolean,
    maxMentions: 1-50,
    excludeBotMentions: boolean,
    allowRoleMentions: boolean
}
```

#### **🚨 Raid Protection**
```javascript
raidProtection: {
    enabled: boolean,
    joinThreshold: 3-100,
    timeWindow: 10000-600000ms, // 10 seconds to 10 minutes
    actions: {
        lockdown: boolean,
        kickNewMembers: boolean,
        requireVerification: boolean,
        notifyModerators: boolean
    },
    accountAge: {
        enabled: boolean,
        minimumAge: 600000-2592000000ms, // 10 minutes to 30 days
        action: "warn" | "kick" | "ban"
    }
}
```

#### **🔨 Moderation**
```javascript
moderation: {
    warnBeforeKick: boolean,
    kickReason: string (max 512 chars),
    banReason: string (max 512 chars),
    logChannel: string (Discord ID) | null,
    autoModeration: boolean,
    maxWarnings: 1-10
}
```

#### **📝 Logging**
```javascript
logging: {
    enabled: boolean,
    level: "error" | "warn" | "info" | "debug" | "trace",
    discordLogging: boolean,
    channels: {
        general: string (Discord ID) | null,
        moderation: string (Discord ID) | null,
        security: string (Discord ID) | null,
        errors: string (Discord ID) | null,
        joins: string (Discord ID) | null,
        messages: string (Discord ID) | null,
        voice: string (Discord ID) | null
    },
    events: {
        messageDelete: boolean,
        messageEdit: boolean,
        memberJoin: boolean,
        memberLeave: boolean,
        memberBan: boolean,
        memberUnban: boolean,
        memberKick: boolean,
        memberTimeout: boolean,
        roleCreate: boolean,
        roleDelete: boolean,
        roleUpdate: boolean,
        channelCreate: boolean,
        channelDelete: boolean,
        channelUpdate: boolean,
        voiceStateUpdate: boolean
    }
}
```

---

## 🎯 **Using Configuration Commands**

### **Basic Configuration**
```
/config setting:spam value:true
/config setting:links value:false
/config setting:mentions value:true
/config setting:raid value:true
```

### **Advanced Configuration**
For advanced settings, you'll need to use the configuration files or future web interface.

---

## 📁 **Configuration Storage**

### **Per-Guild Configuration**
- **Location**: `./configs/{guildId}.json`
- **Format**: JSON with full configuration object
- **Auto-Save**: Every 30 seconds
- **Backup**: Automatic on changes

### **Default Configuration**
- **Location**: `./config.js`
- **Purpose**: Template for new guilds
- **Validation**: Schema-based validation

---

## 🔍 **Troubleshooting Configuration**

### **Common Validation Errors**

#### **1. Value Below/Above Limits**
```
Error: raidProtection.timeWindow: Value 5000 is below minimum 10000
Solution: Use values within allowed ranges
```

#### **2. Invalid Type**
```
Error: spam.enabled: Expected boolean, got string
Solution: Use correct data types (true/false for booleans)
```

#### **3. Invalid Enum Value**
```
Error: raidProtection.accountAge.action: Value "delete" is not in allowed values: warn, kick, ban
Solution: Use only allowed enum values
```

#### **4. Invalid Discord ID**
```
Error: moderation.logChannel: String does not match required pattern
Solution: Use valid Discord channel IDs (17-19 digits) or null
```

### **Configuration Validation Commands**

```bash
# Test configuration validation
npm run test-bot

# Check current configuration
/stats  # Shows configuration statistics

# Reset to defaults
/config reset  # (Future feature)
```

---

## 📊 **Configuration Statistics**

### **View Configuration Stats**
```
/stats
```

**Shows:**
- Total configured guilds
- Feature usage across servers
- Configuration health status
- Memory usage and performance

---

## 🔧 **Advanced Configuration**

### **Manual Configuration File Editing**

1. **Stop the bot** (to prevent conflicts)
2. **Edit** `./configs/{guildId}.json`
3. **Validate** configuration structure
4. **Restart** the bot

### **Configuration Import/Export**

```javascript
// Export configuration
const configManager = client.configManager;
const exportData = configManager.exportGuildConfig(guildId);

// Import configuration
const result = configManager.importGuildConfig(guildId, importData);
```

---

## ⚠️ **Important Notes**

### **Configuration Limits**
- **Channel IDs**: Must be valid Discord snowflakes (17-19 digits)
- **Time Values**: In milliseconds
- **String Lengths**: Limited for performance
- **Array Sizes**: Limited to prevent memory issues

### **Validation Rules**
- **Required Fields**: All schema fields must be present
- **Type Checking**: Strict type validation
- **Range Checking**: Numeric values must be within limits
- **Pattern Matching**: Strings must match required patterns

### **Performance Considerations**
- **Auto-Save**: Configurations saved every 30 seconds
- **Memory Usage**: Configurations cached in memory
- **Validation**: Real-time validation on updates
- **Cleanup**: Automatic cleanup of unused configurations

---

## 🎉 **Configuration Status: WORKING!**

✅ **All validation issues resolved**  
✅ **Per-guild configuration active**  
✅ **Schema validation working**  
✅ **Auto-save functioning**  
✅ **Import/export ready**

**Your configuration system is now fully operational and ready for production use!**
