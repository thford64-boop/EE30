const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const TOKEN = 'ur key'; // Regenerate at discord.com/developers/applications
const MY_ID = 'ur id';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Cache to store messages before they're deleted
const messageCache = new Map();
const MAX_CACHE = 5000;

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log('📦 Fetching message history (last 100 per channel)...');

  for (const guild of client.guilds.cache.values()) {
    try {
      const channels = guild.channels.cache.filter(
        (ch) => ch.isTextBased() && ch.viewable
      );

      for (const channel of channels.values()) {
        try {
          const messages = await channel.messages.fetch({ limit: 100 });
          for (const message of messages.values()) {
            if (message.author?.bot) continue;
            messageCache.set(message.id, {
              content: message.content,
              author: message.author.tag,
              authorId: message.author.id,
              channelId: message.channelId,
              channelName: channel.name,
              guildId: guild.id,
              attachments: message.attachments.map((a) => a.url),
              timestamp: message.createdAt,
            });
          }
          console.log(`  ✓ Cached ${messages.size} messages from #${channel.name}`);
        } catch {
          // Skip channels the bot can't read
        }
      }
    } catch {
      // Skip guilds with permission issues
    }
  }

  console.log(`✅ Cache ready — ${messageCache.size} messages stored.`);
});

// Cache every message as it comes in
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  messageCache.set(message.id, {
    content: message.content,
    author: message.author.tag,
    authorId: message.author.id,
    channelId: message.channelId,
    channelName: message.channel.name,
    guildId: message.guildId,
    attachments: message.attachments.map((a) => a.url),
    timestamp: message.createdAt,
  });

  // Trim cache if too large
  if (messageCache.size > MAX_CACHE) {
    const oldest = messageCache.keys().next().value;
    messageCache.delete(oldest);
  }
});

// Listen for deleted messages
client.on('messageDelete', async (message) => {
  const cached = messageCache.get(message.id);
  if (!cached) return; // Not in cache (too old or uncached)

  const guild = client.guilds.cache.get(cached.guildId);
  if (!guild) return;

  // Find the requester (the bot owner / MY_ID)
  const owner = await guild.members.fetch(MY_ID).catch(() => null);
  if (!owner) return;

  // Check if deleted message author is a moderator
  const deletedMember = await guild.members.fetch(cached.authorId).catch(() => null);
  const isModerator =
    deletedMember &&
    (deletedMember.permissions.has(PermissionFlagsBits.ManageMessages) ||
      deletedMember.permissions.has(PermissionFlagsBits.Administrator));

  const embed = new EmbedBuilder()
    .setTitle('🗑️ Deleted Message Detected')
    .setColor(isModerator ? 0xff0000 : 0xffa500)
    .addFields(
      { name: 'Author', value: `${cached.author} (<@${cached.authorId}>)`, inline: true },
      { name: 'Channel', value: `<#${cached.channelId}> (${cached.channelName})`, inline: true },
      { name: 'Moderator?', value: isModerator ? '✅ Yes' : '❌ No', inline: true },
      { name: 'Message Content', value: cached.content || '*[No text content]*' },
      {
        name: 'Sent At',
        value: `<t:${Math.floor(cached.timestamp.getTime() / 1000)}:F>`,
        inline: true,
      }
    )
    .setTimestamp();

  if (cached.attachments.length > 0) {
    embed.addFields({ name: 'Attachments', value: cached.attachments.join('\n') });
  }

  // DM the bot owner
  try {
    const ownerUser = await client.users.fetch(MY_ID);
    await ownerUser.send({ embeds: [embed] });
  } catch (err) {
    console.error('Could not DM owner:', err.message);
  }

  // Also look for a #mod-logs channel and log there
  const logChannel = guild.channels.cache.find(
    (ch) => ch.name === 'mod-logs' || ch.name === 'modlogs' || ch.name === 'logs'
  );
  if (logChannel) {
    // Only post in mod-logs if you (MY_ID) are a moderator in this server
    if (owner.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  messageCache.delete(message.id);
});

// !snipe command — shows the last deleted message in a channel (mod only)
const lastDeleted = new Map(); // channelId -> cached message

client.on('messageDelete', (message) => {
  const cached = messageCache.get(message.id);
  if (cached) lastDeleted.set(cached.channelId, cached);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.content.toLowerCase() !== '!snipe') return;

  // Only allow moderators or the bot owner
  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  const isOwner = message.author.id === MY_ID;
  const isMod =
    member &&
    (member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.Administrator));

  if (!isOwner && !isMod) {
    return message.reply('❌ You need Manage Messages permission to use this command.');
  }

  const snipe = lastDeleted.get(message.channelId);
  if (!snipe) return message.reply('No recently deleted messages in this channel.');

  const embed = new EmbedBuilder()
    .setTitle('🔍 Sniped Message')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Author', value: `${snipe.author}`, inline: true },
      { name: 'Deleted from', value: `<#${snipe.channelId}>`, inline: true },
      { name: 'Content', value: snipe.content || '*[No text]*' }
    )
    .setTimestamp(snipe.timestamp);

  message.channel.send({ embeds: [embed] });
});

client.login(TOKEN);
