require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js'); // keren jir di buat dyna

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and response time'),
    
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for kicking the user')
                .setRequired(false)),
    

    
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Show current bot configuration and status'),
    
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for banning the user')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('delete_days')
                .setDescription('Number of days of messages to delete (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to timeout')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Timeout duration in minutes')
                .setMinValue(1)
                .setMaxValue(40320) // 28 days max
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the timeout')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true)),
    
    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View warnings for a user')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to check warnings for')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear messages from a channel')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Only delete messages from this user')
                .setRequired(false)),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information and available commands'),

    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get information about a user or server')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to get information about')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('config')
        .setDescription('Configure bot settings (Admin only)')
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('Setting to configure')
                .setRequired(true)
                .addChoices(
                    { name: 'Spam Detection', value: 'spam' },
                    { name: 'Link Detection', value: 'links' },
                    { name: 'Mention Detection', value: 'mentions' },
                    { name: 'Profanity Filter', value: 'profanity' },
                    { name: 'Raid Protection', value: 'raid' }
                ))
        .addBooleanOption(option =>
            option.setName('value')
                .setDescription('Enable or disable the setting')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Reload bot commands or configuration (Admin only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('What to reload')
                .setRequired(false)
                .addChoices(
                    { name: 'Commands', value: 'commands' },
                    { name: 'Configuration', value: 'config' }
                )),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View detailed bot statistics (Admin only)'),

    new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Enable or disable maintenance mode (Admin only)')
        .addBooleanOption(option =>
            option.setName('enable')
                .setDescription('Enable or disable maintenance mode')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for maintenance')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('cleanup')
        .setDescription('Clean up bot caches and temporary data (Admin only)'),

    new SlashCommandBuilder()
        .setName('raidprotection')
        .setDescription('Manage raid protection settings and view status (Admin only)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Show Status', value: 'status' },
                    { name: 'Enable Protection', value: 'enable' },
                    { name: 'Disable Protection', value: 'disable' },
                    { name: 'Activate Lockdown', value: 'lockdown' },
                    { name: 'Deactivate Lockdown', value: 'unlock' },
                    { name: 'Show Statistics', value: 'stats' }
                )),

    new SlashCommandBuilder()
        .setName('contentfilter')
        .setDescription('Manage content filtering settings (Admin only)')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Show Status', value: 'status' },
                    { name: 'Enable Filter', value: 'enable' },
                    { name: 'Disable Filter', value: 'disable' },
                    { name: 'Add Custom Word', value: 'add-word' },
                    { name: 'Remove Custom Word', value: 'remove-word' },
                    { name: 'Add to Whitelist', value: 'whitelist-add' },
                    { name: 'Remove from Whitelist', value: 'whitelist-remove' },
                    { name: 'Show Statistics', value: 'stats' }
                ))
        .addStringOption(option =>
            option.setName('word')
                .setDescription('Word to add or remove from filter')
                .setRequired(false))
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to add or remove from whitelist')
                .setRequired(false))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('🚀 Starting command deployment...');
        console.log(`📋 Total commands to deploy: ${commands.length}`);
        console.log(`🤖 Client ID: ${process.env.CLIENT_ID}`);
        console.log(`🏠 Guild ID: ${process.env.GUILD_ID || 'Not set (deploying globally)'}`);

        // Validate environment variables
        if (!process.env.DISCORD_TOKEN) {
            throw new Error('❌ DISCORD_TOKEN is not set in environment variables');
        }

        if (!process.env.CLIENT_ID) {
            throw new Error('❌ CLIENT_ID is not set in environment variables');
        }

        console.log('✅ Environment variables validated');
        console.log('📡 Connecting to Discord API...');

        // For guild-specific commands (faster deployment for testing)
        if (process.env.GUILD_ID) {
            console.log('🎯 Deploying to specific guild (faster)...');
            const result = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`✅ Successfully deployed ${result.length} guild commands!`);
            console.log('⚡ Commands should be available immediately in your test server');
        } else {
            // For global commands (takes up to 1 hour to deploy)
            console.log('🌍 Deploying globally (may take up to 1 hour)...');
            const result = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
            console.log(`✅ Successfully deployed ${result.length} global commands!`);
            console.log('⏰ Global commands may take up to 1 hour to appear');
        }

        console.log('\n🎉 Command deployment completed successfully!');
        console.log('💡 If commands don\'t appear, try:');
        console.log('   1. Restart Discord client');
        console.log('   2. Wait a few minutes');
        console.log('   3. Check bot permissions in server');

    } catch (error) {
        console.error('❌ Error deploying commands:');
        console.error('Error details:', error.message);

        if (error.code === 50001) {
            console.error('🔒 Missing Access: Bot may not be in the server or lacks permissions');
        } else if (error.code === 50013) {
            console.error('🚫 Missing Permissions: Bot needs "applications.commands" scope');
        } else if (error.status === 401) {
            console.error('🔑 Invalid Token: Check your DISCORD_TOKEN in .env file');
        } else if (error.status === 404) {
            console.error('🔍 Not Found: Check your CLIENT_ID or GUILD_ID in .env file');
        }

        console.error('\n🛠️ Troubleshooting:');
        console.error('   1. Verify bot token is correct');
        console.error('   2. Ensure bot is invited to server with proper permissions');
        console.error('   3. Check CLIENT_ID and GUILD_ID are correct');
        process.exit(1);
    }
})();
