# 🛡️ Security Bot

An advanced Discord security and moderation bot built with Discord.js v14. This bot provides comprehensive server protection with intelligent spam detection, link filtering, mention monitoring, and automated moderation features.

## ✨ Features

### 🔒 Security & Moderation
- **Intelligent Spam Detection** - Advanced duplicate message detection with similarity checking
- **Link Filtering** - Whitelist-based URL filtering with shortener detection
- **Mention Protection** - Configurable mention limits and ghost ping detection
- **Automated Moderation** - Progressive punishment system (warn → timeout → kick → ban)
- **Raid Protection** - Account age verification and join rate limiting
- **Content Filtering** - Profanity filter with multiple language support

### 🎛️ Management Commands
- `/kick` - Kick users with reason logging
- `/ban` - Ban users with message deletion options
- `/timeout` - Timeout users for specified duration
- `/warn` - Issue warnings to users
- `/clear` - Bulk delete messages with user filtering
- `/config` - Configure bot settings (Admin only)
- `/status` - View current bot configuration

### 📊 Logging & Monitoring
- Comprehensive action logging with timestamps
- Configurable log channels for different event types
- Performance monitoring and cache management
- Error handling and warning systems

## 🚀 Quick Start

### Prerequisites
- Node.js 16.9.0 or higher
- A Discord application and bot token
- Basic knowledge of Discord permissions

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/security-bot.git
   cd security-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your bot token:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_application_id_here
   GUILD_ID=your_test_guild_id_here (optional, for faster command deployment)
   ```

4. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## ⚙️ Configuration

The bot can be configured through the `config.js` file or using slash commands:

### Basic Configuration
```javascript
// config.js
module.exports = {
    spam: {
        enabled: true,
        maxDuplicateMessages: 1,
        cooldown: 10000 // 10 seconds
    },
    links: {
        enabled: true,
        whitelist: ['discord.gg', 'github.com', 'youtube.com']
    },
    mentions: {
        enabled: true,
        maxMentions: 3
    }
};
```

### Runtime Configuration
Use `/config` command to modify settings:
- `/config setting:spam value:true` - Enable spam detection
- `/config setting:links value:false` - Disable link filtering
- `/config setting:mentions value:true` - Enable mention protection

## 🔧 Commands

### Moderation Commands
| Command | Description | Permissions Required |
|---------|-------------|---------------------|
| `/ping` | Check bot latency | None |
| `/kick <user> [reason]` | Kick a user | Kick Members |
| `/ban <user> [reason] [delete_days]` | Ban a user | Ban Members |
| `/timeout <user> <duration> [reason]` | Timeout a user | Moderate Members |
| `/warn <user> <reason>` | Warn a user | Kick Members |
| `/clear <amount> [user]` | Delete messages | Manage Messages |

### Configuration Commands
| Command | Description | Permissions Required |
|---------|-------------|---------------------|
| `/config <setting> <value>` | Configure bot settings | Administrator |
| `/status` | View bot status | None |
| `/warnings [user]` | View user warnings | Kick Members |
| `/help` | Show help information | None |

## 🛠️ Development

### Scripts
- `npm start` - Start the bot
- `npm run dev` - Start with nodemon for development
- `npm run deploy` - Deploy slash commands
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run format` - Format code

### Project Structure
```
security-bot/
├── index.js              # Main bot file
├── config.js             # Configuration settings
├── utils.js              # Utility functions
├── deploy-commands.js    # Command deployment script
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables
└── README.md            # Documentation
```

## 📋 Required Permissions

The bot requires the following Discord permissions:
- View Channels
- Send Messages
- Manage Messages
- Kick Members
- Ban Members
- Moderate Members (for timeouts)
- Manage Roles
- View Audit Log

## 🔐 Security Features

### Spam Protection
- Duplicate message detection
- Message similarity analysis
- Rate limiting with cooldowns
- Progressive punishment system

### Link Security
- Domain whitelist filtering
- URL shortener detection
- Suspicious link identification
- File type validation

### Account Protection
- New account detection
- Raid protection mechanisms
- Join rate monitoring
- Verification requirements

## 📈 Performance

- Efficient caching system with automatic cleanup
- Rate limiting to prevent API abuse
- Memory optimization for large servers
- Configurable performance settings

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- Create an [issue](https://github.com/your-username/security-bot/issues) for bug reports
- Join our [Discord server](https://discord.gg/your-invite) for support
- Check the [documentation](https://github.com/your-username/security-bot/wiki) for detailed guides

## 🙏 Acknowledgments

- [Discord.js](https://discord.js.org/) - The Discord API library
- [Node.js](https://nodejs.org/) - JavaScript runtime
- Contributors and community members

---

**⚠️ Important**: Never share your bot token publicly. Keep your `.env` file secure and add it to `.gitignore`.